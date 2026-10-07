import os
import psycopg2
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

from ops_filter import get_test_all_centers

# ────── Env Initialization ────────────────────────────────────────────────────────────────────────
env_path = Path(__file__).resolve().parent.parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)


# ────── Database configuration ────────────────────────────────────────────────────────────────────
DB_HOST = os.getenv('DB_HOST')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_PORT = os.getenv('DB_PORT')


# ────── Score weights ─────────────────────────────────────────────────────────────────────────────
# score = score_base + (n_detections * SCORE_WEIGHT_DAYS) + (total_tests * SCORE_WEIGHT_TESTS)
SCORE_WEIGHT_DAYS = 2
SCORE_WEIGHT_TESTS = 0.1


def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)


# ────── Database connection ───────────────────────────────────────────────────────────────────────
def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
        port=DB_PORT
    )


# ────── Daily detection ───────────────────────────────────────────────────────────────────────────
def run_daily_detection():
    log("=== INICIANDO DETECCIÓN DIARIA (backfill automático desde detección inicial) ===")
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        active_test_all, _ = get_test_all_centers(cursor, feature='test_all')

        cursor.execute("""
            SELECT id, center_id, created_at::date, score_base FROM commercial_opportunity
        """)
        active_opportunities = cursor.fetchall()
        log(f"Centros con oportunidad activa: {len(active_opportunities)}")

        if not active_opportunities:
            log("No hay oportunidades activas. Saliendo.")
            return

        total_inserted = 0
        yesterday = (datetime.now().date() - timedelta(days=1))

        for opp_id, center_id, created_date, score_base in active_opportunities:
            if str(center_id) in active_test_all:
                cursor.execute("""
                    UPDATE commercial_opportunity
                    SET status = 'converted'
                    WHERE id = %s AND status = 'pending'
                """, (opp_id,))
                log(f"Centro {center_id} ahora tiene test_all activo → oportunidad {opp_id} marcada como 'converted'.")
                continue

            log(f"Procesando centro {center_id} (oportunidad {opp_id}) desde {created_date} hasta {yesterday}")

            cursor.execute("""
                SELECT detected_at::date FROM opportunity_detections
                WHERE opportunity_id = %s
            """, (opp_id,))
            existing_dates = {row[0] for row in cursor.fetchall()}

            current_date = created_date
            while current_date <= yesterday:
                if current_date in existing_dates:
                    current_date += timedelta(days=1)
                    continue

                cursor.execute("""
                    SELECT tests_finished FROM daily_stats
                    WHERE center_id = %s AND stat_date = %s
                """, (str(center_id), current_date))
                result = cursor.fetchone()
                total_tests_day = result[0] if result and result[0] is not None else 0

                if total_tests_day > 0:
                    cursor.execute("""
                        INSERT INTO opportunity_detections (opportunity_id, detected_at, total_tests_day)
                        VALUES (%s, %s, %s)
                    """, (opp_id, current_date, total_tests_day))
                    existing_dates.add(current_date)
                    log(f"{center_id} el {current_date}: +{total_tests_day} tests")
                    total_inserted += 1

                current_date += timedelta(days=1)

            # Recalcular score desde opportunity_detections
            cursor.execute("""
                SELECT COUNT(*), COALESCE(SUM(total_tests_day), 0)
                FROM opportunity_detections
                WHERE opportunity_id = %s
            """, (opp_id,))
            n_detections, total_tests = cursor.fetchone()

            new_score = (
                score_base
                + (n_detections * SCORE_WEIGHT_DAYS)
                + int(round(total_tests * SCORE_WEIGHT_TESTS))
            )
            cursor.execute("""
                UPDATE commercial_opportunity SET score = %s WHERE id = %s
            """, (new_score, opp_id))
            log(f"Oportunidad {opp_id}: {n_detections} detecciones, {total_tests} tests "
                f"→ score = {new_score}")

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