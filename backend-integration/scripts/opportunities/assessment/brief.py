# ────── Assessment AI brief ─────────────────────────────────────────────────────────────────────────────────────────────────────
# ── The Assessment prompt for the brief (the OpenRouter call and the checks live in shared/ai_brief.py).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
from shared.ai_brief import call_brief, context_lines, trend_dir, TREND_TEXT, ACCESS_CHECK_TEXT
from shared.scoring import WINDOW_DAYS, TREND_DAYS


# ────── Signature ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── signature = what has to change for the brief to be regenerated: kind, priority, trend direction and check reasons.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def signature(r):
    return f"{r['kind']}|{r['priority']}|{trend_dir(r)}|{','.join(sorted(r.get('check_reasons') or []))}"


# ────── Prompt ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
TRACK_TEXT = {
    "upgrade": "Nunca ha tenido test_all (Assessment). Es una oportunidad de upgrade.",
    "review": "Tuvo test_all en una suscripción anterior, ya no lo tiene y sigue usando tests. Es una oportunidad de recuperación.",
    "expansion": "Ya tiene test_all (Assessment) y está entre los centros que más lo usan. No se le ofrece nada concreto: "
                 "el objetivo es entender sus necesidades.",
}

# ── What the person has to check first, by check reason (see assessment/pool.py).
CHECK_TEXT = {
    **ACCESS_CHECK_TEXT,
    "test_all_unverified": "Tiene test_all en una suscripción que no está verificada.",
    "had_test_all_before": "Tuvo test_all antes.",
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
    lines += context_lines(ctx, skip=("tests_finished",))
    return "\n".join(lines)


def generate_brief(center_id, r, ctx):
    return call_brief(center_id, SYSTEM_PROMPT, build_prompt(r, ctx))
