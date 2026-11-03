# ────── Sessions AI brief ───────────────────────────────────────────────────────────────────────────────────────────────────────
# ── The Sessions prompt for the brief (the OpenRouter call and the checks live in shared/ai_brief.py).
# ── Nothing specific is offered: we only detect the case, the sales/CS person decides what to offer.
# ── The session counts go separately (assigned, started, finished): centers don't all work the same way.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
from shared.ai_brief import call_brief, context_lines, trend_dir, TREND_TEXT, ACCESS_CHECK_TEXT
from shared.scoring import WINDOW_DAYS, TREND_DAYS

PREFIX = 'sessions'


# ────── Signature ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── signature = what has to change for the brief to be regenerated: kind, priority, trend direction and check reasons.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def signature(r):
    return f"{r['kind']}|{r['priority']}|{trend_dir(r, PREFIX)}|{','.join(sorted(r.get('check_reasons') or []))}"


# ────── Prompt ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
KIND_TEXT = {
    "high_use": "Es uno de los clientes que más usa las sesiones. No se le ofrece nada concreto: el objetivo es entender "
                "sus necesidades (más profesionales, más pacientes, otro plan…).",
    "churn": "Su uso de sesiones ha caído mucho en el último mes. Es un caso de retención: entender qué ha cambiado.",
    "adoption": "Inicia muchas sesiones pero termina pocas. Es un caso de adopción: entender si tienen alguna dificultad.",
    "access_review": "Usa las sesiones, pero su suscripción no está verificada.",
}

SYSTEM_PROMPT = """Eres un asistente del equipo comercial y de Customer Success de NeuronUP, una plataforma de neurorrehabilitación para centros y profesionales.
Preparas un briefing breve para la persona que va a contactar a un centro por su uso de las sesiones de la plataforma.

Reglas:
- Usa SOLO los datos que te dan. No inventes hechos, cifras ni motivos.
- No ofrezcas ningún producto ni plan concreto, y no atribuyas beneficios a nada: el objetivo es entender al centro.
- "summary": 1 frase que describa cómo usa el centro las sesiones, con al menos una cifra concreta.
- "points": exactamente 2 enfoques para la conversación. Cada uno se apoya en un dato concreto distinto
  (cítalo) y dice qué mencionar o preguntar al centro. Ejemplos de forma:
  "Terminan 6 de cada 10 sesiones que inician: preguntar si los pacientes encuentran alguna dificultad."
  "Sus sesiones han bajado de 80 a 20 en un mes: conviene preguntar si ha cambiado algo en el equipo."
- Si hay algo "A revisar", el primer enfoque debe tratarlo (verificar la suscripción, retener o regularizar el acceso).
  Si NO hay nada "A revisar", no menciones la suscripción ni pidas verificarla.
- Céntrate en las sesiones. El "Resto de uso" es solo contexto: no lo conviertas en un enfoque salvo que esté
  claramente relacionado con la situación del centro.
- Las sesiones asignadas, iniciadas y finalizadas son datos distintos: no las sumes. Muchos centros inician
  sesiones sin asignarlas, así que no presentes eso como un problema.
- Un dato a 0 puede ser relevante, pero no lo presentes como un problema del centro.
- No uses términos internos: score, percentil, prioridad, "top X%", track.
- Tono sugerente y profesional, en español, sin saludos. Cada frase con menos de 25 palabras.
- Responde SOLO con JSON: {"summary": "...", "points": ["...", "..."]}"""


def build_prompt(r, ctx):
    lines = [
        "DATOS DEL CENTRO:",
        f"- Situación: {KIND_TEXT.get(r['kind'], r['kind'])}",
        *[f"- A revisar: {ACCESS_CHECK_TEXT[c]}" for c in (r.get('check_reasons') or []) if c in ACCESS_CHECK_TEXT],
        f"- Sesiones finalizadas en {WINDOW_DAYS} días: {r['total_sessions']}, en {r['active_days']} días con sesiones "
        f"(media {r['avg_daily']:.1f} por día activo)",
        f"- Sesiones iniciadas en {WINDOW_DAYS} días: {r['sessions_started']}",
        f"- Sesiones asignadas en {WINDOW_DAYS} días: {r['sessions_assigned']}",
    ]
    if r.get("completion_rate") is not None:
        lines.append(f"- Termina {round(100 * r['completion_rate'])} de cada 100 sesiones que inicia")
    lines.append(f"- Tendencia de sesiones finalizadas: {TREND_TEXT[trend_dir(r, PREFIX)]} "
                 f"({r['sessions_recent']} en los últimos {TREND_DAYS} días frente a {r['sessions_previous']} "
                 f"en los {TREND_DAYS} anteriores)")
    if r.get("sessions_home_finished"):
        lines.append(f"- Sesiones finalizadas en casa (no en el centro): {r['sessions_home_finished']}")
    if r.get("avg_patients"):
        lines.append(f"- Pacientes distintos con sesión, de media por día: {r['avg_patients']}")
    lines += context_lines(ctx, skip=("sessions_assigned", "sessions_started", "sessions_finished"))
    return "\n".join(lines)


def generate_brief(center_id, r, ctx):
    return call_brief(center_id, SYSTEM_PROMPT, build_prompt(r, ctx))
