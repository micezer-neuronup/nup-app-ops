# ────── Documented ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import os
import psycopg2
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

from ops_filter import get_centers_with_feature, get_current_customers
from scoring import fetch_usage, build_scored_pool

# ────── Env configuration ─────────────────────────────────────────────────────────────────────────────────────────────────────────
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
env_path = Path(__file__).resolve().parent.parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)


# ────── Database configuration ────────────────────────────────────────────────────────────────────────────────────────────────────
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DB_HOST = os.getenv('DB_HOST')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_PORT = os.getenv('DB_PORT')


# ────── Score weights ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Since v2 the score is not accumulated here anymore: it is recomputed from the current 60 days window
# ── with compute_usage_score (scoring.py), the same formula the weekly detector uses (0-100).
# ── The old formula (score_base + n_detections * 2 + total_tests * 0.1) kept growing forever, so older
# ── opportunities always outranked new ones.
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────


def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)


# ────── Database connection ───────────────────────────────────────────────────────────────────────────────────────────────────────
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
        port=DB_PORT
    )


# ────── Daily detection ───────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── We call the function get_centers_with_feature and recieve the centers with active test_all.
# ── If the Ops API fails it raises and the job stops (we never continue without knowing who has test_all).
# ── We obtain all pending and completed opportunities (not converted nor expired) and store them in active_opportunities.
# ── We get the date of yesterday(To check available data till that date from daily_stats).
# ── For each opportunity if the center is in active_test_all, we set the status to converted.
# ── This applies to pending and completed ones: a reviewed center that later buys test_all also converts.
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── We then proceed to fetch all daily activity from detection date till yesterday.
# ── For this we fitrst get all the existing dates of all the opportunities on opportunity_detections (one query).
# ── Then we get all the days with tests_finished > 0 from daily_stats for those centers (one query).
# ── If the date is in existing_dates we skip it.
# ── If not in existing_dates and the date is between the detection date and yesterday, we insert it inside opportunity_detections.
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── After inserting new dialy detections, we proceed to refresh the score of the pending and completed opportunities.
# ── Completed ones are refreshed too, so if they are reverted to pending (Deshacer) their numbers are current.
# ── We build the scored pool (scoring.py) with the current 60 days usage and set score and current_* from it.
# ── If the center is not in the pool (no usage or not a customer) we leave it as it is: the weekly job expires it.
# ── The column score_base must not be touched.
# ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def run_daily_detection():
    log("=== INICIANDO DETECCIÓN DIARIA (backfill automático desde detección inicial) ===")
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        active_test_all, had_test_all = get_centers_with_feature(cursor, feature='test_all')

        cursor.execute("""
            SELECT id, center_id, created_at::date, status
            FROM commercial_opportunity
            WHERE status IN ('pending', 'completed')
        """)
        active_opportunities = cursor.fetchall()
        log(f"Oportunidades a procesar (pending y completed): {len(active_opportunities)}")

        if not active_opportunities:
            log("No hay oportunidades. Saliendo.")
            return

        yesterday = (datetime.now().date() - timedelta(days=1))

        to_track = []
        for opp_id, center_id, created_date, status in active_opportunities:
            if str(center_id) in active_test_all:
                cursor.execute("""
                    UPDATE commercial_opportunity
                    SET status = 'converted'
                    WHERE id = %s AND status IN ('pending', 'completed')
                """, (opp_id,))
                if cursor.rowcount > 0:
                    log(f"Centro {center_id} ahora tiene test_all activo → oportunidad {opp_id} marcada como 'converted'.")
                continue
            to_track.append((opp_id, str(center_id), created_date, status))

        total_inserted = 0
        if to_track:
            opp_ids = [opp_id for opp_id, _, _, _ in to_track]
            cursor.execute("""
                SELECT opportunity_id, detected_at::date FROM opportunity_detections
                WHERE opportunity_id = ANY(%s)
            """, (opp_ids,))
            existing_dates = {}
            for opp_id, d in cursor.fetchall():
                existing_dates.setdefault(opp_id, set()).add(d)

            center_ids = list({cid for _, cid, _, _ in to_track})
            min_date = min(created_date for _, _, created_date, _ in to_track)
            cursor.execute("""
                SELECT center_id, stat_date, tests_finished FROM daily_stats
                WHERE center_id = ANY(%s) AND stat_date BETWEEN %s AND %s AND tests_finished > 0
            """, (center_ids, min_date, yesterday))
            days_by_center = {}
            for center_id, stat_date, tests in cursor.fetchall():
                days_by_center.setdefault(str(center_id), []).append((stat_date, tests))

            for opp_id, cid, created_date, _ in to_track:
                seen = existing_dates.get(opp_id, set())
                for stat_date, tests in days_by_center.get(cid, []):
                    if stat_date < created_date or stat_date in seen:
                        continue
                    cursor.execute("""
                        INSERT INTO opportunity_detections (opportunity_id, detected_at, total_tests_day)
                        VALUES (%s, %s, %s)
                    """, (opp_id, stat_date, tests))
                    seen.add(stat_date)
                    total_inserted += 1

        customers = get_current_customers(cursor)
        scored = build_scored_pool(fetch_usage(cursor), customers, active_test_all, had_test_all)

        refreshed = 0
        for opp_id, cid, _, status in to_track:
            r = scored.get(cid)
            if not r:
                continue
            cursor.execute("""
                UPDATE commercial_opportunity
                SET score = %s,
                    current_total_tests_60d = %s,
                    current_active_days_60d = %s,
                    current_avg_daily_60d = %s
                WHERE id = %s
            """, (r["score"], r["total_tests"], r["active_days"], r["avg_daily"], opp_id))
            refreshed += 1

        conn.commit()
        log(f"Total nuevas detecciones insertadas: {total_inserted} | scores refrescados: {refreshed}")

    except Exception as e:
        log(f"Error en detección diaria: {e}", "ERROR")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_daily_detection()
