# ────── Documented ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Sessions pools: how a center that uses sessions is classified (the score itself is in shared/scoring.py).
# ── Every center has access to sessions (it is not a feature), so what we look at is how much and how they use them.
# ── The metric is sessions_finished. sessions_assigned is not used to classify: many centers start sessions without
# ── assigning them (in production started/assigned goes up to 4x), so assigned is not a step every center goes through.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
from shared.scoring import (compute_usage_score, percentile_of, ACCESS_REASONS, NO_ACCESS, WINDOW_DAYS,
                            TREND_DAYS, COOLDOWN_DAYS, HIGH_PERCENTILE)

PREFIX = 'sessions'


# ────── Script configuration ────────────────────────────────────────────────────────────────────────────────────────────────────
# ── TOP_PERCENTILE: high_use = verified customers at or above this percentile of the score (0.97 = top 3%).
# ── CHURN_MIN_PREVIOUS / CHURN_DROP: churn = at least CHURN_MIN_PREVIOUS finished sessions in the previous TREND_DAYS
# ──   and the last TREND_DAYS at or below CHURN_DROP of that (0.4 = a drop of 60% or more).
# ── ADOPTION_MIN_STARTED / ADOPTION_MAX_RATIO: adoption = at least ADOPTION_MIN_STARTED started sessions in the window
# ──   and finished/started at or below ADOPTION_MAX_RATIO (in production the worst 10% is around 0.22).
# ── MIN_SESSIONS / MIN_SESSION_DAYS: floor of this module (finished sessions in the window, on at least that many days).
# ──   It is not the shared one (10 on 3 days): sessions are daily use, and with it the first prod dry run (03/11/2026)
# ──   gave 302 opportunities (116 to review). It also sets the reference pool of the score (verified customers over it).
# ── Centers that start a lot (ADOPTION_MIN_STARTED) also pass the floor, as they barely finish but they do use sessions.
# ── First values (prod dry run 03/11/2026): top 5%, churn 20 / 50%, adoption 20 / 0.25 → 41 high_use, 43 churn, 102 adoption.
# ── REVIEW_MIN_PERCENTILE: access_review only for centers whose score is at or above this percentile of the verified
# ──   customers (0.5 = they use sessions at least as much as the median customer). With only the floor, 76 centers
# ──   went to review and the floor barely changed it: most of them use sessions a lot.
# ── To compare other values against the real data: sessions_detector.py --dry-run --calibrate.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
MIN_SESSIONS = 30
MIN_SESSION_DAYS = 8
TOP_PERCENTILE = 0.97
CHURN_MIN_PREVIOUS = 40
CHURN_DROP = 0.4
ADOPTION_MIN_STARTED = 40
ADOPTION_MAX_RATIO = 0.15
REVIEW_MIN_PERCENTILE = 0.5


# ────── Extra usage ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── started, assigned, home sessions and patients per active day of every center, in one query.
# ── session_patients can't be added across days (a patient counts once per day), so we use its average per day with sessions.
# ── The home and patients columns come from the migration 003 (filled by daily_events.py and backfill.py).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def fetch_session_extras(cursor):
    cursor.execute("""
        SELECT
            center_id::text,
            COALESCE(SUM(sessions_started), 0),
            COALESCE(SUM(sessions_assigned), 0),
            COALESCE(SUM(sessions_home_finished), 0),
            COALESCE(AVG(session_patients) FILTER (WHERE sessions_started > 0 OR sessions_finished > 0), 0)
        FROM daily_stats
        WHERE stat_date >= CURRENT_DATE - %s * INTERVAL '1 day'
        GROUP BY center_id
        HAVING SUM(sessions_started) > 0 OR SUM(sessions_finished) > 0
    """, (WINDOW_DAYS,))
    return {
        cid: {"sessions_started": int(st), "sessions_assigned": int(asg), "sessions_home_finished": int(home),
              "avg_patients": round(float(patients), 1)}
        for cid, st, asg, home, patients in cursor.fetchall()
    }


def with_extras(u, extra):
    finished = u["total_sessions"]
    started = extra["sessions_started"]
    return {
        **u,
        **extra,
        "completion_rate": round(finished / started, 2) if started else None,
        "home_share": round(extra["sessions_home_finished"] / finished, 2) if finished else 0.0,
    }


# ────── Kinds ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── One kind per center, the first that applies (the most urgent one goes first):
# ──   trial access only → skipped (trials are not opportunities).
# ──   access_review: uses sessions over the floor without verified access (Revisar, with its access reason).
# ──   churn: verified customer whose finished sessions dropped CHURN_DROP or more (Riesgo).
# ──   adoption: verified customer that starts a lot but finishes few (Adopción).
# ──   high_use: verified customer in the top TOP_PERCENTILE of the score (Uso alto).
# ── The score is computed for every center against the verified ones over the floor, so the percentile means
# ── "compared with the customers that use sessions".
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REASON_TEXT = {
    'no_active_subscription': "Usa sesiones sin una suscripción activa",
    'cancelled_with_access': "Canceló, pero sigue con acceso y usando sesiones",
    'access_unverified': "Tiene acceso, pero no sabemos si su suscripción sigue activa",
}


def passes_floor(r):
    return r["total_sessions"] >= MIN_SESSIONS and r["active_days"] >= MIN_SESSION_DAYS


def uses_sessions(r):
    return passes_floor(r) or r["sessions_started"] >= ADOPTION_MIN_STARTED


def is_churn(r):
    previous, recent = r["sessions_previous"], r["sessions_recent"]
    return previous >= CHURN_MIN_PREVIOUS and recent <= previous * CHURN_DROP


def is_adoption(r):
    return (r["sessions_started"] >= ADOPTION_MIN_STARTED and r["completion_rate"] is not None
            and r["completion_rate"] <= ADOPTION_MAX_RATIO)


def build_scored_pool(usage, extras, access):
    scored, verified = {}, {}
    for cid, u in usage.items():
        a = access.get(cid, NO_ACCESS)
        if a["level"] == 'trial':
            continue
        r = with_extras(u, extras.get(cid, {"sessions_started": 0, "sessions_assigned": 0,
                                            "sessions_home_finished": 0, "avg_patients": 0.0}))
        scored[cid] = {**r, "access": a["level"], "check_reasons": []}
        if a["level"] == 'verified':
            verified[cid] = r

    # Every center is scored against the verified customers over the floor (the reference pool)
    pool_ids = [cid for cid, u in verified.items() if passes_floor(u)]
    pool_totals = sorted(verified[cid]["total_sessions"] for cid in pool_ids)
    for cid, r in scored.items():
        score, parts = compute_usage_score(r, pool_totals, PREFIX)
        r.update({"score": score, "score_parts": parts})
    pool_scores = sorted(scored[cid]["score"] for cid in pool_ids)
    for r in scored.values():
        r["score_percentile"] = round(percentile_of(r["score"], pool_scores), 3)

    top_pct = int(round((1 - TOP_PERCENTILE) * 100))
    for cid, r in scored.items():
        r["eligible"] = uses_sessions(r)
        r["priority"] = 'alta' if r["score_percentile"] >= HIGH_PERCENTILE else 'media'
        if r["access"] != 'verified':
            r["kind"] = 'access_review'
            r["eligible"] = r["eligible"] and r["score_percentile"] >= REVIEW_MIN_PERCENTILE
            r["check_reasons"] = [ACCESS_REASONS[r["access"]]]
            r["track_reason"] = REASON_TEXT[r["check_reasons"][0]]
        elif is_churn(r):
            drop = round(100 * (1 - r["sessions_recent"] / r["sessions_previous"]))
            r["kind"] = 'churn'
            r["eligible"] = True
            r["track_reason"] = f"Sus sesiones finalizadas han caído un {drop}% en el último mes"
        elif is_adoption(r):
            r["kind"] = 'adoption'
            r["track_reason"] = f"Termina solo el {round(100 * r['completion_rate'])}% de las sesiones que inicia"
        else:
            r["kind"] = 'high_use'
            r["eligible"] = r["eligible"] and r["score_percentile"] >= TOP_PERCENTILE
            r["priority"] = 'alta' if r["eligible"] else None
            r["track_reason"] = (f"Uso de sesiones en el top {top_pct}% de clientes" if r["eligible"]
                                 else "Uso de sesiones por debajo del top de clientes")
        if not r["eligible"] and r["kind"] != 'high_use':
            r["priority"] = None
    return scored


def thresholds():
    return {
        "window_days": WINDOW_DAYS,
        "trend_days": TREND_DAYS,
        "min_sessions": MIN_SESSIONS,
        "min_active_days": MIN_SESSION_DAYS,
        "top_percentile": TOP_PERCENTILE,
        "churn_min_previous": CHURN_MIN_PREVIOUS,
        "churn_drop": CHURN_DROP,
        "adoption_min_started": ADOPTION_MIN_STARTED,
        "adoption_max_ratio": ADOPTION_MAX_RATIO,
        "review_min_percentile": REVIEW_MIN_PERCENTILE,
        "cooldown_days": COOLDOWN_DAYS,
    }
