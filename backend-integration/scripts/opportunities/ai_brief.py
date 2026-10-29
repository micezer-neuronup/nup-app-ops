# ────── AI contact brief ────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Short brief for the person who contacts the center: one sentence on the situation and two talking points.
# ── It only uses our own data: the scoring of the opportunity and the wider usage of daily_stats (no HubSpot, no contact data).
# ── It is optional: if OpenRouter fails or answers badly we return None and the job goes on (unlike the Ops API).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import os
import json
from datetime import datetime
from pathlib import Path
import requests
from dotenv import load_dotenv

from scoring import WINDOW_DAYS, TREND_DAYS

env_path = Path(__file__).resolve().parent.parent.parent / ".env.development"
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
# ── Wider usage of the centers in the window, in one query: sessions, reports, activities, logins and team size.
# ── The tests are not here, they already come in the scoring (fetch_usage).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def fetch_context(cursor, center_ids):
    if not center_ids:
        return {}
    cursor.execute("""
        SELECT
            center_id::text,
            COALESCE(SUM(sessions_created), 0),
            COALESCE(SUM(sessions_finished), 0),
            COALESCE(SUM(reports_created), 0),
            COALESCE(SUM(activities_started), 0),
            COALESCE(SUM(total_logins), 0),
            COALESCE(AVG(active_therapists), 0),
            COUNT(DISTINCT stat_date) FILTER (WHERE total_logins > 0 OR activities_started > 0 OR tests_finished > 0)
        FROM daily_stats
        WHERE stat_date >= CURRENT_DATE - %s * INTERVAL '1 day'
          AND center_id::text = ANY(%s)
        GROUP BY center_id
    """, (WINDOW_DAYS, list(center_ids)))

    context = {}
    for cid, s_created, s_finished, reports, activities, logins, therapists, days in cursor.fetchall():
        context[cid] = {
            "sessions_created": int(s_created),
            "sessions_finished": int(s_finished),
            "reports_created": int(reports),
            "activities_started": int(activities),
            "total_logins": int(logins),
            "avg_active_therapists": round(float(therapists), 1),
            "days_with_activity": int(days),
        }
    return context


# ────── Signature ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── trend_dir uses the same ±10% rule as trendOf in the dashboard.
# ── signature = what has to change for the brief to be regenerated: kind, priority, trend direction and check reasons.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def trend_dir(r):
    previous, recent = r["tests_previous"], r["tests_recent"]
    if previous == 0:
        return "new" if recent > 0 else "flat"
    change = (recent - previous) / previous
    return "up" if change >= TREND_CHANGE else "down" if change <= -TREND_CHANGE else "flat"


def signature(r):
    return f"{r['kind']}|{r['priority']}|{trend_dir(r)}|{','.join(sorted(r.get('check_reasons') or []))}"


# ────── Prompt ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
TRACK_TEXT = {
    "upgrade": "Nunca ha tenido test_all (Assessment). Es una oportunidad de upgrade.",
    "review": "Tuvo test_all en una suscripción anterior, ya no lo tiene y sigue usando tests. Es una oportunidad de recuperación.",
    "expansion": "Ya tiene test_all (Assessment) y está entre los centros que más lo usan. No se le ofrece nada concreto: "
                 "el objetivo es entender sus necesidades.",
}

# ── What the person has to check first, by check reason (see scoring.py).
CHECK_TEXT = {
    "no_active_subscription": "No tiene ninguna suscripción activa, pero usa la plataforma: hay que confirmar si debería pagar o retirarle el acceso.",
    "cancelled_with_access": "Canceló su suscripción, pero aún tiene acceso y la usa: puede ser un buen momento para retenerlo.",
    "access_unverified": "Tiene acceso, pero no sabemos si su suscripción sigue activa: hay que verificarlo antes de ofrecer nada.",
    "test_all_unverified": "Tiene test_all en una suscripción que no está verificada.",
    "had_test_all_before": "Tuvo test_all antes.",
}

TREND_TEXT = {
    "up": "creciendo",
    "down": "bajando",
    "flat": "estable",
    "new": "nuevo (sin uso de tests en el periodo anterior)",
}

SYSTEM_PROMPT = """Eres un asistente del equipo comercial y de Customer Success de NeuronUP, una plataforma de neurorrehabilitación para centros y profesionales.
Preparas un briefing breve para la persona que va a contactar a un centro y ofrecerle Assessment (test_all).

Reglas:
- Usa SOLO los datos que te dan. No inventes hechos, cifras ni motivos.
- No atribuyas beneficios a Assessment (nada de "mejorar", "beneficiarse", "optimizar", "potenciar"). No describas el producto.
- "summary": 1 frase que describa cómo usa el centro la plataforma, con al menos una cifra concreta.
- "points": exactamente 2 enfoques para la conversación. Cada uno se apoya en un dato concreto distinto
  (cítalo) y dice qué mencionar o preguntar al centro. Ejemplos de forma:
  "Hacen 5 tests por día activo: preguntar cómo gestionan hoy las evaluaciones."
  "El uso de tests cae a la mitad en el último mes: conviene preguntar si ha cambiado algo en el equipo."
- Si hay algo "A revisar", el primer enfoque debe tratarlo (verificar la suscripción, retener o regularizar el acceso).
- Si el centro tuvo test_all antes, uno de los enfoques debe tratar esa recuperación.
- Si ya tiene test_all, no ofrezcas Assessment: pregunta por sus necesidades.
- Un dato a 0 puede ser relevante, pero no lo presentes como un problema del centro.
- No uses términos internos: score, percentil, prioridad, "top X%", track.
- Tono sugerente y profesional, en español, sin saludos. Cada frase con menos de 25 palabras.
- Responde SOLO con JSON: {"summary": "...", "points": ["...", "..."]}"""


def build_prompt(r, ctx):
    lines = [
        "DATOS DEL CENTRO:",
        f"- Situación: {TRACK_TEXT.get(r['kind'], r['kind'])}",
        *[f"- A revisar: {CHECK_TEXT[c]}" for c in (r.get('check_reasons') or []) if c in CHECK_TEXT],
        ("- Uso de tests: de los que más usan tests entre los centros con test_all" if r["kind"] == "expansion"
         else "- Uso de tests: de los que más usan tests entre los centros sin test_all" if r["priority"] == "alta"
         else "- Uso de tests: constante"),
        f"- Tests completados en {WINDOW_DAYS} días: {r['total_tests']}, repartidos en {r['active_days']} días con tests "
        f"(media {r['avg_daily']:.1f} por día activo)",
        f"- Tendencia de tests: {TREND_TEXT[trend_dir(r)]} "
        f"({r['tests_recent']} en los últimos {TREND_DAYS} días frente a {r['tests_previous']} en los {TREND_DAYS} anteriores)",
    ]
    if ctx:
        lines += [
            f"- Resto de uso en {WINDOW_DAYS} días:",
            f"  - Días con alguna actividad: {ctx['days_with_activity']}",
            f"  - Sesiones creadas: {ctx['sessions_created']} (finalizadas: {ctx['sessions_finished']})",
            f"  - Informes creados: {ctx['reports_created']}",
            f"  - Actividades iniciadas: {ctx['activities_started']}",
            f"  - Inicios de sesión: {ctx['total_logins']}",
            f"  - Terapeutas activos de media al día: {ctx['avg_active_therapists']}",
        ]
    return "\n".join(lines)


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


def generate_brief(center_id, r, ctx):
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_prompt(r, ctx)},
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
