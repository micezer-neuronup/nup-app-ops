# ────── AI contact brief ────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Short brief for the person who contacts the center: one sentence on the situation and two talking points.
# ── It only uses our own data: the scoring of the opportunity and the wider usage of daily_stats (no HubSpot, no contact data).
# ── It is optional: if OpenRouter fails or answers badly we return None and the job goes on (unlike the Ops API).
# ── This file has what every module shares (OpenRouter call, answer check, usage context). Each module writes its own
# ── prompt (assessment/brief.py, sessions/brief.py).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import os
import json
from datetime import datetime
from pathlib import Path
import requests
from dotenv import load_dotenv

from shared.scoring import WINDOW_DAYS

env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)


# ────── OpenRouter configuration ────────────────────────────────────────────────────────────────────────────────────────────────
# ── AI_BRIEF_MAX_PER_RUN: cap of briefs generated per weekly run (the highest scores go first).
# ── MAX_TEXT_CHARS: an answer longer than this per sentence is discarded (the prompt asks for ~25 words).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY')
OPENROUTER_MODEL = "openai/gpt-4o-mini"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

AI_BRIEF_MAX_PER_RUN = 50
MAX_TEXT_CHARS = 260
TREND_CHANGE = 0.10


def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)


def brief_enabled():
    return bool(OPENROUTER_API_KEY)


# ────── Context ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Wider usage of the centers in the window, in one query: tests, sessions, reports, activities, logins and team size.
# ── The sessions go as three separate counts (assigned, started, finished): centers work in different ways
# ── (many start sessions without assigning them), so they are never added up.
# ── sessions_created is not used: 'Session - Created' is ignored by daily_events.py, so that column is always 0.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def fetch_context(cursor, center_ids):
    if not center_ids:
        return {}
    cursor.execute("""
        SELECT
            center_id::text,
            COALESCE(SUM(tests_finished), 0),
            COALESCE(SUM(sessions_assigned), 0),
            COALESCE(SUM(sessions_started), 0),
            COALESCE(SUM(sessions_finished), 0),
            COALESCE(SUM(reports_created), 0),
            COALESCE(SUM(activities_started), 0),
            COALESCE(SUM(total_logins), 0),
            COALESCE(AVG(active_therapists), 0),
            COUNT(DISTINCT stat_date) FILTER (WHERE total_logins > 0 OR activities_started > 0 OR tests_finished > 0
                                                 OR sessions_started > 0)
        FROM daily_stats
        WHERE stat_date >= CURRENT_DATE - %s * INTERVAL '1 day'
          AND center_id::text = ANY(%s)
        GROUP BY center_id
    """, (WINDOW_DAYS, list(center_ids)))

    context = {}
    for (cid, tests, s_assigned, s_started, s_finished, reports, activities, logins,
         therapists, days) in cursor.fetchall():
        context[cid] = {
            "tests_finished": int(tests),
            "sessions_assigned": int(s_assigned),
            "sessions_started": int(s_started),
            "sessions_finished": int(s_finished),
            "reports_created": int(reports),
            "activities_started": int(activities),
            "total_logins": int(logins),
            "avg_active_therapists": round(float(therapists), 1),
            "days_with_activity": int(days),
        }
    return context


def context_lines(ctx, skip=()):
    if not ctx:
        return []
    rows = [
        ("days_with_activity", f"  - Días con alguna actividad: {ctx['days_with_activity']}"),
        ("tests_finished", f"  - Tests finalizados: {ctx['tests_finished']}"),
        ("sessions_assigned", f"  - Sesiones asignadas: {ctx['sessions_assigned']}"),
        ("sessions_started", f"  - Sesiones iniciadas: {ctx['sessions_started']}"),
        ("sessions_finished", f"  - Sesiones finalizadas: {ctx['sessions_finished']}"),
        ("reports_created", f"  - Informes creados: {ctx['reports_created']}"),
        ("activities_started", f"  - Actividades iniciadas: {ctx['activities_started']}"),
        ("total_logins", f"  - Inicios de sesión: {ctx['total_logins']}"),
        ("avg_active_therapists", f"  - Usuarios activos de media al día: {ctx['avg_active_therapists']}"),
    ]
    return [f"- Resto de uso en {WINDOW_DAYS} días:"] + [line for key, line in rows if key not in skip]


# ────── Trend ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── trend_dir uses the same ±10% rule as trendOf in the dashboard. prefix is the metric of the module (tests, sessions).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def trend_dir(r, prefix='tests'):
    previous, recent = r[f"{prefix}_previous"], r[f"{prefix}_recent"]
    if previous == 0:
        return "new" if recent > 0 else "flat"
    change = (recent - previous) / previous
    return "up" if change >= TREND_CHANGE else "down" if change <= -TREND_CHANGE else "flat"


TREND_TEXT = {
    "up": "creciendo",
    "down": "bajando",
    "flat": "estable",
    "new": "nuevo (sin uso en el periodo anterior)",
}

# ── What the person has to check first, by access reason (shared/scoring.py ACCESS_REASONS).
ACCESS_CHECK_TEXT = {
    "no_active_subscription": "No tiene ninguna suscripción activa, pero usa la plataforma: hay que confirmar si debería pagar o retirarle el acceso.",
    "cancelled_with_access": "Canceló su suscripción, pero aún tiene acceso y la usa: puede ser un buen momento para retenerlo.",
    "access_unverified": "Tiene acceso, pero no sabemos si su suscripción sigue activa: hay que verificarlo antes de ofrecer nada.",
}


# ────── Generation ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── One call per center. The answer has to be JSON with a summary and exactly two points, each one not too long.
# ── Any error (network, HTTP, JSON, shape) logs a warning and returns None.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def parse_brief(content):
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):]
    data = json.loads(text[text.find("{"):text.rfind("}") + 1])

    summary = data.get("summary")
    points = data.get("points")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("summary vacío")
    if not isinstance(points, list) or len(points) != 2 or not all(isinstance(p, str) and p.strip() for p in points):
        raise ValueError("points no son 2 textos")
    if any(len(t) > MAX_TEXT_CHARS for t in [summary, *points]):
        raise ValueError("texto demasiado largo")
    return {"summary": summary.strip(), "points": [p.strip() for p in points]}


def call_brief(center_id, system_prompt, user_prompt):
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 300,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }

    try:
        response = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        content = response.json()['choices'][0]['message']['content']
        return parse_brief(content)
    except Exception as e:
        log(f"Brief IA no generado para centro {center_id}: {e}", "WARN")
        return None


# ────── Write briefs ────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Called by every weekly job AFTER its main commit, so a slow or failing OpenRouter never touches the main writes.
# ── pending_briefs: (opp_id, center_id, r). generate_brief and signature come from the module (assessment/brief.py...).
# ── Each brief is committed on its own. At most AI_BRIEF_MAX_PER_RUN per run, highest score first.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def write_briefs(conn, cursor, pending_briefs, generate_brief, signature):
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
