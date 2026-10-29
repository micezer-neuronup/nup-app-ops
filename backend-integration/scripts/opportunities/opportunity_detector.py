# ────── Documented ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import os
import sys
import json
import psycopg2
from datetime import datetime
from pathlib import Path
import requests
from dotenv import load_dotenv

from ops_filter import load_center_access, FEATURE_NOW_LEVELS
from scoring import fetch_usage, build_scored_pool, thresholds, WINDOW_DAYS, COOLDOWN_DAYS

# ────── Env configuration ───────────────────────────────────────────────────────────────────────────────────────────────────────
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
# ── The config lives in ai_brief.py (the AI contact brief), imported here for generate_ai_justification.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
from ai_brief import (OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_URL, AI_BRIEF_MAX_PER_RUN,
                      brief_enabled, fetch_context, generate_brief, signature)


# ────── Script configuration ────────────────────────────────────────────────────────────────────────────────────────────────────
# ── The thresholds (WINDOW_DAYS, MIN_TESTS, MIN_ACTIVE_DAYS, HIGH_PERCENTILE, COOLDOWN_DAYS) live in scoring.py,
# ── shared with daily_usage_detector so both jobs score the same way.
# ── DRY_RUN_TOP: how many candidates the --dry-run prints.
# ── DRY_RUN_BRIEFS: how many AI briefs the --dry-run --brief generates and prints (not saved).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
DRY_RUN_TOP = 20
DRY_RUN_BRIEFS = 5


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
# ── Not called since v2 (build_justification is used instead). The AI contact brief now lives in ai_brief.py.
# ── The function is called for each oportunity detected. 
# ── We set the prompt fot Open Router.
# ── If the call to Open Router fails, then we have a fallback that return a manual justification with the data.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def generate_ai_justification(center_id, total_tests, active_days, avg_daily):
    prompt = f"""Eres un asistente para el equipo de Customer Success.

DATOS DEL CENTRO:
- ID: {center_id}
- Tests completados en los últimos {WINDOW_DAYS} días: {total_tests}
- Días con actividad: {active_days}
- Media de tests por día activo: {avg_daily:.1f}

INSTRUCCIONES:
Redacta un mensaje breve (máximo 2 frases) para el agente, con los siguientes puntos:
1. Resumen ejecutivo del uso (tests, días activos, media).
2. Recomendación final: contactar para ofrecer Assessment (sin describir el producto).

EJEMPLO DE ESTILO:
"El centro ha completado 55 tests en 60 días (18 días activos, media 3.1). Recomendamos contactar para ofrecer Assessment."

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
            f"Contactar para ofrecer Assessment."
        )


# ────── Justification ───────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Deterministic text for the agent: the track reason plus the usage summary (no API call).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def build_justification(r):
    action = ("Contactar para conocer sus necesidades." if r["kind"] == 'expansion'
              else "Revisar su situación antes de ofrecer Assessment." if r["check_reasons"]
              else "Contactar para ofrecer Assessment.")
    return (
        f"{r['track_reason']}. {r['total_tests']} tests en {WINDOW_DAYS} días "
        f"({r['active_days']} días activos, media {r['avg_daily']:.1f}). {action}"
    )


def build_trigger_details(r):
    return {
        "total_tests": r["total_tests"],
        "active_days": r["active_days"],
        "avg_daily": r["avg_daily"],
        "tests_recent": r["tests_recent"],
        "tests_previous": r["tests_previous"],
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


# ────── Opportunity detection ───────────────────────────────────────────────────────────────────────────────────────────────────
# ── load_center_access gives the access level of every center and of its test_all (see ops_filter.py).
# ── If the Ops API fails it raises, and the run stops without writing anything.
# ── fetch_usage gets the 60 days usage of every center from daily_stats in one query.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── build_scored_pool puts every center with tests in a group and scores it (see scoring.py):
# ──   'assessment': without test_all now. Verified customers go to Pendientes, the ones with check_reasons to Revisar.
# ──   'expansion': verified customers with test_all now, only the top percentile (Uso alto con Assessment).
# ── kind 'review' = had test_all (recovery track), 'upgrade' = never had it, 'expansion' = has it now.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── With --dry-run we only print the pool and the top candidates, nothing is written.
# ── Each open opportunity belongs to a group: 'expansion' if its kind is expansion, 'assessment' otherwise.
# ── Pending opportunities: if the center is still eligible in the same group we refresh current_*, score, kind
# ── and trigger_details. Completed ones (inside the cooldown) are refreshed the same way but never expired.
# ── If it is no longer eligible in its group the status goes to 'expired'.
# ── Assessment ones whose center has test_all now are left to daily_usage_detector, which marks them as 'converted'.
# ── New opportunities: eligible centers without a pending one in the same group and without one completed
# ── in the last COOLDOWN_DAYS.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── AI brief (ai_brief.py): new opportunities, and refreshed ones whose signature (kind|priority|trend) changed or
# ── without a brief yet, get one AFTER the commit, so a slow or failing OpenRouter never touches the main writes.
# ── Each brief is committed on its own. At most AI_BRIEF_MAX_PER_RUN per run, highest score first.
# ── With --dry-run --brief we print the briefs of the top DRY_RUN_BRIEFS candidates without writing them.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def write_briefs(conn, cursor, pending_briefs):
    if not pending_briefs:
        log("Briefs IA: nada que generar")
        return
    if not brief_enabled():
        log(f"Briefs IA: sin OPENROUTER_API_KEY, se omiten {len(pending_briefs)}", "WARN")
        return

    pending_briefs.sort(key=lambda item: item[2]["score"], reverse=True)
    to_generate = pending_briefs[:AI_BRIEF_MAX_PER_RUN]
    skipped = len(pending_briefs) - len(to_generate)
    context = fetch_context(cursor, [cid for _, cid, _ in to_generate])

    generated = failed = 0
    for opp_id, cid, r in to_generate:
        brief = generate_brief(cid, r, context.get(cid))
        if not brief:
            failed += 1
            continue
        cursor.execute("""
            UPDATE commercial_opportunity
            SET ai_brief = %s::jsonb, ai_brief_at = NOW(), ai_brief_signature = %s
            WHERE id = %s
        """, (json.dumps(brief, ensure_ascii=False), signature(r), opp_id))
        conn.commit()
        generated += 1

    log(f"Briefs IA: generados {generated} | fallidos {failed} | omitidos por límite {skipped}")


def run_assessment_detection(dry_run=False, dry_run_brief=False):
    log(f"=== INICIANDO DETECCIÓN SEMANAL ({WINDOW_DAYS} días){' [DRY RUN]' if dry_run else ''} ===")
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        access = load_center_access(cursor, feature='test_all')
        usage = fetch_usage(cursor)

        scored = build_scored_pool(usage, access)
        eligible = sorted(
            (cid for cid, r in scored.items() if r["eligible"]),
            key=lambda cid: scored[cid]["score"], reverse=True
        )
        by_track, by_reason = {}, {}
        for cid in eligible:
            key = f"{scored[cid]['kind']}/{scored[cid]['priority']}"
            by_track[key] = by_track.get(key, 0) + 1
            for reason in scored[cid]["check_reasons"] or ['ninguno']:
                by_reason[reason] = by_reason.get(reason, 0) + 1

        log(f"Centros con tests: {len(usage)} | En algún grupo: {len(scored)} | Elegibles: {len(eligible)}")
        log(f"Por track: {by_track} | Motivos de revisión: {by_reason} | Umbrales: {thresholds()}")

        if dry_run:
            log(f"Top {DRY_RUN_TOP} candidatos:")
            for cid in eligible[:DRY_RUN_TOP]:
                r = scored[cid]
                log(f"  centro {cid}: score {r['score']} ({r['kind']}/{r['priority']}) "
                    f"tests {r['total_tests']}, días {r['active_days']}, "
                    f"recientes {r['tests_recent']} vs previos {r['tests_previous']} | acceso {r['access']} "
                    f"| {r['track_reason']}")
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
            WHERE product = 'assessments'
              AND (status = 'pending'
                   OR (status = 'completed' AND COALESCE(updated_at, created_at) >= NOW() - %s * INTERVAL '1 day'))
        """, (COOLDOWN_DAYS,))
        open_rows = cursor.fetchall()
        group_of = lambda kind: 'expansion' if kind == 'expansion' else 'assessment'
        blocked = {(str(row[1]), group_of(row[5])) for row in open_rows}

        pending_briefs = []
        refreshed = expired = 0
        for opp_id, center_id, status, has_brief, brief_signature, kind in open_rows:
            cid = str(center_id)
            group = group_of(kind)
            if group == 'assessment' and access.get(cid, {}).get("feature_level") in FEATURE_NOW_LEVELS:
                continue

            r = scored.get(cid)
            if r and r["eligible"] and r["group"] == group:
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
                """, (r["total_tests"], r["active_days"], r["avg_daily"], r["score"], r["kind"],
                      json.dumps(build_trigger_details(r)), opp_id))
                refreshed += 1
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
                """, (r["total_tests"] if r else 0, r["active_days"] if r else 0, r["avg_daily"] if r else 0, opp_id))
                why = ("ya no está en el top de centros con test_all" if group == 'expansion'
                       else "por debajo del mínimo" if r and r["group"] == group
                       else "sin uso de tests en la ventana o solo acceso de prueba")
                log(f"Centro {cid}: oportunidad {opp_id} ({kind}) → 'expired' ({why})")
                expired += 1

        new_opportunities = 0
        for cid in eligible:
            if (cid, scored[cid]["group"]) in blocked:
                continue
            r = scored[cid]

            cursor.execute("""
                INSERT INTO commercial_opportunity
                    (center_id, product, status, created_at, last_detected_at, total_tests_60d, active_days_60d,
                     avg_daily_60d, current_total_tests_60d, current_active_days_60d, current_avg_daily_60d,
                     score_base, score, ai_justification, trigger_details, opportunity_kind)
                VALUES (%s, 'assessments', 'pending', NOW(), NOW(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                RETURNING id
            """, (cid, r["total_tests"], r["active_days"], r["avg_daily"],
                  r["total_tests"], r["active_days"], r["avg_daily"],
                  r["score"], r["score"], build_justification(r),
                  json.dumps(build_trigger_details(r)), r["kind"]))

            opp_id = cursor.fetchone()[0]
            log(f"✅ Oportunidad ID {opp_id} ({r['kind']}/{r['priority']}) creada para centro {cid} (score: {r['score']})")
            new_opportunities += 1
            pending_briefs.append((opp_id, cid, r))

        conn.commit()
        log(f"Total nuevas oportunidades: {new_opportunities} | refrescadas: {refreshed} | expiradas: {expired}")

        write_briefs(conn, cursor, pending_briefs)

    except Exception as e:
        log(f"Error en detección semanal: {e}", "ERROR")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_assessment_detection(dry_run="--dry-run" in sys.argv, dry_run_brief="--brief" in sys.argv)
