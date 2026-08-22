import os
import psycopg2
from datetime import datetime, timedelta
from pathlib import Path
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

def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
        port=DB_PORT
    )

def run_daily_detection():
    log("=== INICIANDO DETECCIÓN DIARIA (backfill automático desde detección inicial) ===")
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        # 1. Obtener todas las oportunidades activas con su fecha de creación
        cursor.execute("""
            SELECT id, center_id, created_at::date FROM commercial_opportunity
            WHERE status = 'pending'
        """)
        active_opportunities = cursor.fetchall()
        log(f"Centros con oportunidad activa: {len(active_opportunities)}")

        if not active_opportunities:
            log("No hay oportunidades activas. Saliendo.")
            return

        total_inserted = 0
        yesterday = (datetime.now().date() - timedelta(days=1))

        for opp_id, center_id, created_date in active_opportunities:
            log(f"Procesando centro {center_id} (oportunidad {opp_id}) desde {created_date} hasta {yesterday}")
            
            # 2. Obtener fechas que ya tienen detección para esta oportunidad
            cursor.execute("""
                SELECT detected_at::date FROM opportunity_detections
                WHERE opportunity_id = %s
            """, (opp_id,))
            existing_dates = {row[0] for row in cursor.fetchall()}

            # 3. Recorrer día a día desde la creación hasta ayer
            current_date = created_date
            while current_date <= yesterday:
                # Si ya existe detección para esta fecha, saltar
                if current_date in existing_dates:
                    current_date += timedelta(days=1)
                    continue

                # Obtener tests de ese día
                cursor.execute("""
                    SELECT SUM(tests_finished) AS total_tests
                    FROM daily_stats
                    WHERE center_id = %s AND stat_date = %s
                """, (str(center_id), current_date))
                result = cursor.fetchone()
                total_tests_day = result[0] if result and result[0] is not None else 0

                if total_tests_day > 0:
                    # Insertar detección
                    cursor.execute("""
                        INSERT INTO opportunity_detections (opportunity_id, detected_at, total_tests_day)
                        VALUES (%s, %s, %s)
                    """, (opp_id, current_date, total_tests_day))

                    # Sumar +2 al score (sin tope)
                    cursor.execute("""
                        UPDATE commercial_opportunity
                        SET score = score + 2
                        WHERE id = %s
                    """, (opp_id,))

                    log(f"  ✅ {center_id} el {current_date}: +{total_tests_day} tests, +2 puntos")
                    total_inserted += 1

                current_date += timedelta(days=1)

        conn.commit()
        log(f"Total nuevas detecciones insertadas: {total_inserted}")

    except Exception as e:
        log(f"Error en detección diaria: {e}", "ERROR")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    run_daily_detection()