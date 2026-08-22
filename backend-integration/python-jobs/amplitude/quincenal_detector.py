import os
import sys
import json
import psycopg2
from datetime import datetime
from pathlib import Path
import requests
from dotenv import load_dotenv

# Cargar variables de entorno
env_path = Path(__file__).resolve().parent.parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)

# Configuración
DB_HOST = os.getenv('DB_HOST')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_PORT = os.getenv('DB_PORT')

OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY')
OPENROUTER_MODEL = "openai/gpt-4o-mini"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# BACKFILL_DATE = '2026-08-01'  # Fecha de la primera detección

UMBRAL = 45
WINDOW_DAYS = 60

def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
        port=DB_PORT
    )

def generate_ai_justification(center_id, total_tests, active_days, avg_daily, p85=None, avg_usage=None):
    comparativa = ""
    if p85 and avg_usage:
        comparativa = f"Supera la media global ({avg_usage:.0f} tests) y el umbral de {UMBRAL} tests, situándose en el percentil 85 ({p85:.0f} tests)."
    
    prompt = f"""Eres un asistente para el equipo de Customer Success.

DATOS DEL CENTRO:
- ID: {center_id}
- Tests completados en los últimos 60 días: {total_tests}
- Días con actividad: {active_days}
- Media de tests por día activo: {avg_daily:.1f}
- {comparativa}

INSTRUCCIONES:
Redacta un mensaje breve (máximo 2 frases) para el agente, con los siguientes puntos:
1. Resumen ejecutivo del uso (tests, días activos, media).
2. Mencionar que supera el umbral y la comparativa con la media/percentil.
3. Recomendación final: contactar para ofrecer Assessment (sin describir el producto).

EJEMPLO DE ESTILO:
"El centro ha completado 55 tests en 60 días (18 días activos, media 3.1). Supera la media global (42 tests) y se sitúa en el percentil 85 (120 tests). Recomendamos contactar para ofrecer Assessment."

REDACTA EL MENSAJE:"""
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 150,
        "temperature": 0.5
    }
    
    try:
        response = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        return data['choices'][0]['message']['content'].strip()
    except Exception as e:
        log(f"Error calling OpenRouter for center {center_id}: {e}", "ERROR")
        return f"Centro {center_id}: {total_tests} tests en 60 días ({active_days} días activos, media {avg_daily:.1f}). Supera percentil 85 ({p85:.0f} tests). Contactar para ofrecer Assessment."

def run_quincenal_detection():
    log("=== INICIANDO DETECCIÓN QUINCENAL (60 días) ===")
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 1. Calcular métricas y percentil exacto para cada centro
        # Backfill: WHERE stat_date >= '2026-08-01'::date - INTERVAL '%s days'

        query = """
            WITH usage AS (
                SELECT
                    center_id,
                    SUM(tests_finished) AS total_tests,
                    COUNT(DISTINCT stat_date) AS active_days,
                    ROUND(AVG(tests_finished)::NUMERIC, 2) AS avg_daily
                FROM daily_stats
                WHERE stat_date >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY center_id
                HAVING SUM(tests_finished) > 0
            )
            SELECT 
                center_id,
                total_tests,
                active_days,
                avg_daily,
                PERCENT_RANK() OVER (ORDER BY total_tests) * 100 AS percentile
            FROM usage
        """
        cursor.execute(query, (WINDOW_DAYS,))
        centers_data = cursor.fetchall()
        log(f"Centros con actividad en últimos {WINDOW_DAYS} días: {len(centers_data)}")

        # 🔥 CORRECCIÓN: Si solo hay un centro, su percentil es 100
        if len(centers_data) == 1 and centers_data:
            center_id, total_tests, active_days, avg_daily, _ = centers_data[0]
            centers_data[0] = (center_id, total_tests, active_days, avg_daily, 100.0)
            log(f"Centro único detectado. Forzando percentil a 100 para centro {center_id}")

        # 2. Percentil 85 y media global (para trigger_details)
        cursor.execute("""
            SELECT 
                PERCENTILE_CONT(0.85) WITHIN GROUP (ORDER BY total_tests),
                AVG(total_tests)
            FROM (
                SELECT SUM(tests_finished) AS total_tests
                FROM daily_stats
                WHERE stat_date >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY center_id
                HAVING SUM(tests_finished) > 0
            ) t
        """, (WINDOW_DAYS,))
        p85, avg_usage = cursor.fetchone()
        log(f"Percentil 85: {p85}, Media global: {avg_usage}")

        # 3. Filtrar candidatos que superan el umbral
        candidates = [row for row in centers_data if row[1] > UMBRAL]
        log(f"Candidatos que superan umbral ({UMBRAL}): {len(candidates)}")

        if not candidates:
            log("No hay candidatos. Saliendo.")
            return

        new_opportunities = 0
        for center_id, total_tests, active_days, avg_daily, percentile in candidates:
            cursor.execute("""
                SELECT id FROM commercial_opportunity
                WHERE center_id = %s AND product = 'assessments' AND status = 'pending'
                LIMIT 1
            """, (str(center_id),))
            existing = cursor.fetchone()
            if existing:
                log(f"Centro {center_id} ya tiene oportunidad activa. Saltando.")
                continue

            justification = generate_ai_justification(center_id, total_tests, active_days, avg_daily, p85, avg_usage)

            # Calcular score base (70% del percentil)
            score_base = int(round((percentile / 100) * 70))
            score = score_base

            trigger_details = json.dumps({
                "total_tests": int(total_tests),
                "active_days": int(active_days),
                "avg_daily": float(avg_daily) if avg_daily is not None else 0.0,
                "window_days": WINDOW_DAYS,
                "percentile": float(percentile),
                "percentile_85": float(p85) if p85 else None,
                "avg_usage": float(avg_usage) if avg_usage else None
            })
            
            # Bacfill: Cambia NOW() por porcentaje y añade CURRENT_DATE despues de (str(center_id)
            cursor.execute("""
                INSERT INTO commercial_opportunity
                    (center_id, product, status, created_at, total_tests_60d, active_days_60d, avg_daily_60d, score, ai_justification, trigger_details)
                VALUES (%s, 'assessments', 'pending', NOW(), %s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id
            """, (str(center_id), total_tests, active_days, avg_daily, score, justification, trigger_details))

            opp_id = cursor.fetchone()[0]
            log(f"✅ Nueva oportunidad creada ID {opp_id} para centro {center_id} (percentil: {percentile:.1f}%, score base: {score})")
            new_opportunities += 1

        conn.commit()
        log(f"Total nuevas oportunidades creadas: {new_opportunities}")

    except Exception as e:
        log(f"Error en detección quincenal: {e}", "ERROR")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    run_quincenal_detection()