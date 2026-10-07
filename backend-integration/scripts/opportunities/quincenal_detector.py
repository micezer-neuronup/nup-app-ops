import os
import sys
import json
import statistics
import psycopg2
from datetime import datetime
from pathlib import Path
import requests
from dotenv import load_dotenv

from ops_filter import get_test_all_centers

# ────── Env Initialization ──────────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
env_path = Path(__file__).resolve().parent.parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)


# ────── Database configuration ──────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DB_HOST = os.getenv('DB_HOST')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_PORT = os.getenv('DB_PORT')


# ────── OpenRouter configuration ────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY')
OPENROUTER_MODEL = "openai/gpt-4o-mini"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ────── Script configuration ────────────────────────────────────────────────────────────────────────────────────────────────────
# ── P85_PERCENTILE: percentile that marks the trigger line. Lower it to detect more centers.
# ── P85_THRESHOLD_FACTOR: multiplies p85. <1.0 → more centers, >1.0 → fewer.
# ── WINDOW_DAYS: forward window to check test activity.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
P85_PERCENTILE = 0.85
P85_THRESHOLD_FACTOR = 1.0
WINDOW_DAYS = 60


def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)


# ────── Database connection ─────────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
        port=DB_PORT
    )


# ────── AI Justification ────────────────────────────────────────────────────────────────────────────────────────────────────────
# ──
# ──
# ──
# ──
# ──
# ──
# ──
# ──
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

def generate_ai_justification(center_id, total_tests, active_days, avg_daily, p85=None, avg_usage=None):
    comparativa = ""
    if p85 and avg_usage:
        comparativa = (
            f"Supera la media global ({avg_usage:.0f} tests) y el umbral del percentil "
            f"{P85_PERCENTILE*100:.0f} ({p85:.0f} tests)."
        )

    prompt = f"""Eres un asistente para el equipo de Customer Success.

DATOS DEL CENTRO:
- ID: {center_id}
- Tests completados en los últimos {WINDOW_DAYS} días: {total_tests}
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
        return (
            f"Centro {center_id}: {total_tests} tests en {WINDOW_DAYS} días "
            f"({active_days} días activos, media {avg_daily:.1f}). "
            f"Supera percentil {P85_PERCENTILE*100:.0f} ({p85:.0f} tests). "
            f"Contactar para ofrecer Assessment."
        )


# ────── Opportunity detection ───────────────────────────────────────────────────────────────────────────────────────────────────
# ──
# ──
# ──
# ──
# ──
# ──
# ──
# ──
# ──
# ──
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def run_quincenal_detection():
    log("=== INICIANDO DETECCIÓN QUINCENAL (60 días) ===")
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 0. Centros con test_all: activos (excluir) y no-activos (marcar 'review')
        active_test_all, cancelled_test_all = get_test_all_centers(cursor, feature='test_all')

        # 1. Métricas por centro (últimos WINDOW_DAYS)
        query = """
            SELECT
                center_id,
                SUM(tests_finished) AS total_tests,
                COUNT(DISTINCT stat_date) AS active_days,
                ROUND(AVG(tests_finished)::NUMERIC, 2) AS avg_daily
            FROM daily_stats
            WHERE stat_date >= CURRENT_DATE - INTERVAL '%s days'
            GROUP BY center_id
            HAVING SUM(tests_finished) > 0
        """
        cursor.execute(query, (WINDOW_DAYS,))
        raw_centers = cursor.fetchall()

        # Filtrar SOLO los que tienen test_all ACTIVO
        centers_data = [row for row in raw_centers if str(row[0]) not in active_test_all]
        log(f"Centros con actividad: {len(raw_centers)} | Tras excluir test_all activos: {len(centers_data)}")

        if not centers_data:
            log("No hay centros candidatos. Saliendo.")
            return

        # 2. Recalcular percentil en Python sobre el pool filtrado
        totals_sorted = sorted([row[1] for row in centers_data])
        n = len(totals_sorted)

        centers_with_pct = []
        for center_id, total_tests, active_days, avg_daily in centers_data:
            if n > 1:
                rank = totals_sorted.index(total_tests)
                percentile = (rank / (n - 1)) * 100
            else:
                percentile = 100.0
            centers_with_pct.append((center_id, total_tests, active_days, avg_daily, percentile))
        centers_data = centers_with_pct

        if n == 1:
            log(f"Centro único detectado. Percentil forzado a 100 para centro {centers_data[0][0]}")

        # 3. p85 y media global — SOLO sobre no-excluidos
        totals = [row[1] for row in centers_data]
        avg_usage = sum(totals) / len(totals) if totals else 0

        if len(totals) >= 2:
            idx = max(0, min(98, int(P85_PERCENTILE * 100) - 1))
            p85 = statistics.quantiles(totals, n=100, method='inclusive')[idx]
        else:
            p85 = totals[0] if totals else 0

        log(f"Percentil {P85_PERCENTILE*100:.0f}: {p85:.2f}, Media global: {avg_usage:.2f}")

        # 4. Candidatos por encima del threshold
        threshold = (p85 or 0) * P85_THRESHOLD_FACTOR
        candidates = [row for row in centers_data if row[1] >= threshold]
        log(f"Candidatos que superan threshold ({threshold:.2f}): {len(candidates)}")

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
            if cursor.fetchone():
                log(f"Centro {center_id} ya tiene oportunidad activa. Saltando.")
                continue

            kind = 'review' if str(center_id) in cancelled_test_all else 'upgrade'

            justification = generate_ai_justification(
                center_id, total_tests, active_days, avg_daily, p85, avg_usage
            )

            score_base = int(round((percentile / 100) * 70))
            score = score_base

            trigger_details = json.dumps({
                "total_tests": int(total_tests),
                "active_days": int(active_days),
                "avg_daily": float(avg_daily) if avg_daily is not None else 0.0,
                "window_days": WINDOW_DAYS,
                "percentile": float(percentile),
                "p85_threshold": float(threshold) if threshold else None,
                "p85_value": float(p85) if p85 else None,
                "avg_usage": float(avg_usage) if avg_usage else None
            })

            cursor.execute("""
                INSERT INTO commercial_opportunity
                    (center_id, product, status, created_at, total_tests_60d, active_days_60d,
                     avg_daily_60d, score_base, score, ai_justification, trigger_details, opportunity_kind)
                VALUES (%s, 'assessments', 'pending', NOW(), %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                RETURNING id
            """, (str(center_id), total_tests, active_days, avg_daily,
                  score_base, score, justification, trigger_details, kind))

            opp_id = cursor.fetchone()[0]
            log(f"✅ Oportunidad ID {opp_id} ({kind}) creada para centro {center_id} "
                f"(percentil: {percentile:.1f}%, score_base: {score_base})")
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