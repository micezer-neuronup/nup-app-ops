# ────── Documented ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Weekly detection of the Sessions opportunities (product 'sessions' in commercial_opportunity).
# ── Same engine as Assessment: access from shared/ops_filter.py, score from shared/scoring.py, brief from sessions/brief.py.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import os
import sys
import json
import psycopg2
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# ── The shared code lives in scripts/opportunities/shared: we add scripts/opportunities to the path to import it.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shared.ops_filter import load_center_access
from shared.scoring import fetch_usage, WINDOW_DAYS, COOLDOWN_DAYS
from shared.ai_brief import brief_enabled, fetch_context, write_briefs
import sessions.pool as pool
from sessions.pool import build_scored_pool, fetch_session_extras, thresholds
from sessions.brief import generate_brief, signature

# ────── Env configuration ───────────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)


# ────── Database configuration ──────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DB_HOST = os.getenv('DB_HOST')
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_PORT = os.getenv('DB_PORT')


# ────── Script configuration ────────────────────────────────────────────────────────────────────────────────────────────────────
# ── PRODUCT: value of commercial_opportunity.product for this module.
# ── The thresholds of the kinds live in sessions/pool.py, the shared ones (window, floor, cooldown) in shared/scoring.py.
# ── DRY_RUN_TOP: how many candidates the --dry-run prints. DRY_RUN_BRIEFS: briefs printed with --dry-run --brief.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
PRODUCT = 'sessions'
DRY_RUN_TOP = 20
DRY_RUN_BRIEFS = 5


def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)


# ────── Calibration ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── --dry-run --calibrate: counts per kind with other values of each threshold, on the same data (one Ops API call).
# ── One group of thresholds changes at a time, the rest keep the values of sessions/pool.py (marked with *).
# ── The kinds go in priority order, so a change in one group can move centers between the other kinds too.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
CALIBRATION = [
    ("Mínimo (finalizadas, días)", ("MIN_SESSIONS", "MIN_SESSION_DAYS"), [(10, 3), (20, 5), (30, 8), (50, 10), (80, 15)]),
    ("Uso alto (percentil)", ("TOP_PERCENTILE",), [(0.95,), (0.97,), (0.98,), (0.99,)]),
    ("Riesgo (mín. mes anterior, hasta % del anterior)", ("CHURN_MIN_PREVIOUS", "CHURN_DROP"),
     [(20, 0.5), (40, 0.5), (40, 0.4), (60, 0.4), (60, 0.3), (100, 0.3)]),
    ("Adopción (mín. iniciadas, finalización máx.)", ("ADOPTION_MIN_STARTED", "ADOPTION_MAX_RATIO"),
     [(20, 0.25), (40, 0.2), (40, 0.15), (60, 0.15), (60, 0.1), (100, 0.1)]),
]
KIND_ORDER = ("access_review", "churn", "adoption", "high_use")


def count_by_kind(scored):
    counts = {k: 0 for k in KIND_ORDER}
    for r in scored.values():
        if r["eligible"]:
            counts[r["kind"]] += 1
    return counts


def run_calibration(usage, extras, access):
    log("Calibración (Revisar / Riesgo / Adopción / Uso alto = total):")
    for title, names, options in CALIBRATION:
        current = tuple(getattr(pool, n) for n in names)
        log(f"  {title}:")
        for values in options:
            for n, v in zip(names, values):
                setattr(pool, n, v)
            c = count_by_kind(build_scored_pool(usage, extras, access))
            mark = "*" if values == current else " "
            log(f"   {mark} {', '.join(str(v) for v in values):>10} → {c['access_review']:4} / {c['churn']:4} / "
                f"{c['adoption']:4} / {c['high_use']:4} = {sum(c.values())}")
        for n, v in zip(names, current):
            setattr(pool, n, v)


# ────── Database connection ─────────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
        port=DB_PORT
    )


# ────── Justification and trigger details ───────────────────────────────────────────────────────────────────────────────────────
# ── Deterministic text for the agent (fallback of the AI brief, and what goes to HubSpot if there is no brief).
# ── trigger_details is what the dashboard reads: metrics, score parts, kind reason, access and thresholds.
# ── The commercial_opportunity columns *_tests_60d hold the metric of the module: here, finished sessions.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ACTION = {
    'high_use': "Contactar para conocer sus necesidades.",
    'churn': "Contactar para entender qué ha cambiado.",
    'adoption': "Contactar para ver si tienen alguna dificultad con las sesiones.",
    'access_review': "Revisar su suscripción antes de contactar.",
}


def build_justification(r):
    return (
        f"{r['track_reason']}. {r['total_sessions']} sesiones finalizadas en {WINDOW_DAYS} días "
        f"({r['active_days']} días con sesiones). {ACTION[r['kind']]}"
    )


def build_trigger_details(r):
    return {
        "total_sessions": r["total_sessions"],
        "active_days": r["active_days"],
        "avg_daily": r["avg_daily"],
        "sessions_recent": r["sessions_recent"],
        "sessions_previous": r["sessions_previous"],
        "sessions_started": r["sessions_started"],
        "sessions_assigned": r["sessions_assigned"],
        "sessions_home_finished": r["sessions_home_finished"],
        "completion_rate": r["completion_rate"],
        "home_share": r["home_share"],
        "avg_patients": r["avg_patients"],
        "percentile": round(r["score_percentile"] * 100, 1),
        "score_volume": round(r["score_parts"]["volume"] * 100, 1),
        "score_consistency": round(r["score_parts"]["consistency"] * 100, 1),
        "score_trend": round(r["score_parts"]["trend"] * 100, 1),
        "priority": r["priority"],
        "track_reason": r["track_reason"],
        "access": r["access"],
        "check_reasons": r["check_reasons"],
        **thresholds(),
    }


# ────── Sessions detection ──────────────────────────────────────────────────────────────────────────────────────────────────────
# ── load_center_access gives the access level of every center (see shared/ops_filter.py). If the Ops API fails it raises
# ── and the run stops without writing anything. The feature is not used: sessions are not a feature.
# ── fetch_usage gets the finished sessions of the window; fetch_session_extras the started, assigned, home and patients.
# ── build_scored_pool gives every center one kind: access_review, churn, adoption or high_use (see sessions/pool.py).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── With --dry-run we only print the counts and the top candidates, nothing is written (--calibrate: see Calibration).
# ── One open opportunity per center: its kind can change from one week to the next (e.g. high_use → churn), so a pending
# ── one that is still eligible is refreshed with the new kind. Completed ones (inside the cooldown) are refreshed but never
# ── expired. A pending one that is not eligible anymore goes to 'expired'.
# ── New opportunities: eligible centers without a pending one and without one completed in the last COOLDOWN_DAYS.
# ── AI briefs (sessions/brief.py) are written after the commit, like in Assessment (shared/ai_brief.py write_briefs).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def run_sessions_detection(dry_run=False, dry_run_brief=False, calibrate=False):
    log(f"=== INICIANDO DETECCIÓN SEMANAL DE SESIONES ({WINDOW_DAYS} días){' [DRY RUN]' if dry_run else ''} ===")
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        access = load_center_access(cursor, feature=None)
        usage = fetch_usage(cursor, metric='sessions_finished')
        extras = fetch_session_extras(cursor)

        scored = build_scored_pool(usage, extras, access)
        eligible = sorted(
            (cid for cid, r in scored.items() if r["eligible"]),
            key=lambda cid: scored[cid]["score"], reverse=True
        )
        by_kind = {}
        for cid in eligible:
            by_kind[scored[cid]["kind"]] = by_kind.get(scored[cid]["kind"], 0) + 1

        log(f"Centros con sesiones finalizadas: {len(usage)} | Sin prueba: {len(scored)} | Elegibles: {len(eligible)}")
        log(f"Por tipo: {by_kind} | Umbrales: {thresholds()}")

        if dry_run and calibrate:
            run_calibration(usage, extras, access)

        if dry_run:
            log(f"Top {DRY_RUN_TOP} candidatos:")
            for cid in eligible[:DRY_RUN_TOP]:
                r = scored[cid]
                log(f"  centro {cid}: score {r['score']} ({r['kind']}/{r['priority']}) "
                    f"finalizadas {r['total_sessions']}, iniciadas {r['sessions_started']}, asignadas {r['sessions_assigned']}, "
                    f"días {r['active_days']}, recientes {r['sessions_recent']} vs previas {r['sessions_previous']} "
                    f"| acceso {r['access']} | {r['track_reason']}")
            if dry_run_brief:
                if not brief_enabled():
                    log("Briefs IA: sin OPENROUTER_API_KEY", "WARN")
                    return
                top = eligible[:DRY_RUN_BRIEFS]
                context = fetch_context(cursor, top)
                log(f"Briefs IA de los top {len(top)} (no se guardan):")
                for cid in top:
                    brief = generate_brief(cid, scored[cid], context.get(cid))
                    log(f"  centro {cid} [{signature(scored[cid])}]: {json.dumps(brief, ensure_ascii=False)}")
            return

        cursor.execute("""
            SELECT id, center_id, status, ai_brief IS NOT NULL, ai_brief_signature, opportunity_kind
            FROM commercial_opportunity
            WHERE product = %s
              AND (status = 'pending'
                   OR (status = 'completed' AND COALESCE(updated_at, created_at) >= NOW() - %s * INTERVAL '1 day'))
        """, (PRODUCT, COOLDOWN_DAYS))
        open_rows = cursor.fetchall()
        blocked_centers = {str(row[1]) for row in open_rows}

        pending_briefs = []
        refreshed = expired = 0
        for opp_id, center_id, status, has_brief, brief_signature, kind in open_rows:
            cid = str(center_id)
            r = scored.get(cid)
            if r and r["eligible"]:
                cursor.execute("""
                    UPDATE commercial_opportunity
                    SET current_total_tests_60d = %s,
                        current_active_days_60d = %s,
                        current_avg_daily_60d = %s,
                        score = %s,
                        opportunity_kind = %s,
                        trigger_details = COALESCE(trigger_details, '{}'::jsonb) || %s::jsonb,
                        last_detected_at = NOW()
                    WHERE id = %s
                """, (r["total_sessions"], r["active_days"], r["avg_daily"], r["score"], r["kind"],
                      json.dumps(build_trigger_details(r)), opp_id))
                refreshed += 1
                if kind != r["kind"]:
                    log(f"Centro {cid}: oportunidad {opp_id} cambia de {kind} a {r['kind']}")
                if not has_brief or brief_signature != signature(r):
                    pending_briefs.append((opp_id, cid, r))
            elif status == 'pending':
                cursor.execute("""
                    UPDATE commercial_opportunity
                    SET status = 'expired',
                        current_total_tests_60d = %s,
                        current_active_days_60d = %s,
                        current_avg_daily_60d = %s,
                        updated_at = NOW()
                    WHERE id = %s
                """, (r["total_sessions"] if r else 0, r["active_days"] if r else 0, r["avg_daily"] if r else 0, opp_id))
                why = "ya no cumple ningún caso" if r else "sin sesiones en la ventana o solo acceso de prueba"
                log(f"Centro {cid}: oportunidad {opp_id} ({kind}) → 'expired' ({why})")
                expired += 1

        new_opportunities = 0
        for cid in eligible:
            if cid in blocked_centers:
                continue
            r = scored[cid]

            cursor.execute("""
                INSERT INTO commercial_opportunity
                    (center_id, product, status, created_at, last_detected_at, total_tests_60d, active_days_60d,
                     avg_daily_60d, current_total_tests_60d, current_active_days_60d, current_avg_daily_60d,
                     score_base, score, ai_justification, trigger_details, opportunity_kind)
                VALUES (%s, %s, 'pending', NOW(), NOW(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                RETURNING id
            """, (cid, PRODUCT, r["total_sessions"], r["active_days"], r["avg_daily"],
                  r["total_sessions"], r["active_days"], r["avg_daily"],
                  r["score"], r["score"], build_justification(r),
                  json.dumps(build_trigger_details(r)), r["kind"]))

            opp_id = cursor.fetchone()[0]
            log(f"✅ Oportunidad ID {opp_id} ({r['kind']}/{r['priority']}) creada para centro {cid} (score: {r['score']})")
            new_opportunities += 1
            pending_briefs.append((opp_id, cid, r))

        conn.commit()
        log(f"Total nuevas oportunidades: {new_opportunities} | refrescadas: {refreshed} | expiradas: {expired}")

        write_briefs(conn, cursor, pending_briefs, generate_brief, signature)

    except Exception as e:
        log(f"Error en detección de sesiones: {e}", "ERROR")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_sessions_detection(dry_run="--dry-run" in sys.argv, dry_run_brief="--brief" in sys.argv,
                           calibrate="--calibrate" in sys.argv)
