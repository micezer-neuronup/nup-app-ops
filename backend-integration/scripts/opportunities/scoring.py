# ────── Documented ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Shared usage scoring for the assessment opportunities (used by opportunity_detector and daily_usage_detector).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
from bisect import bisect_left, bisect_right


# ────── Script configuration ────────────────────────────────────────────────────────────────────────────────────────────────────
# ── WINDOW_DAYS: backtrack window to check test activity.
# ── TREND_DAYS: the window is split in two halves of TREND_DAYS to compare recent vs previous usage.
# ── MIN_TESTS / MIN_ACTIVE_DAYS: usage floor. A center below it is not an opportunity (and pending ones expire).
# ── HIGH_PERCENTILE: centers whose score is at or above this percentile of the eligible pool get priority 'alta'.
# ── COOLDOWN_DAYS: a center whose opportunity was completed is not detected again during these days.
# ── WEIGHT_*: weights of each score part. They must add up to 1.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
WINDOW_DAYS = 60
TREND_DAYS = 30
MIN_TESTS = 10
MIN_ACTIVE_DAYS = 3
HIGH_PERCENTILE = 0.85
COOLDOWN_DAYS = 90

WEIGHT_VOLUME = 0.5
WEIGHT_CONSISTENCY = 0.3
WEIGHT_TREND = 0.2


# ────── Usage fetch ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── One query to daily_stats for the whole window, grouped by center.
# ── active_days only counts days with at least one finished test (not days with any activity).
# ── tests_recent is the last TREND_DAYS, tests_previous the TREND_DAYS before.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def fetch_usage(cursor):
    cursor.execute("""
        SELECT
            center_id,
            SUM(tests_finished) AS total_tests,
            COUNT(DISTINCT stat_date) FILTER (WHERE tests_finished > 0) AS active_days,
            COALESCE(SUM(tests_finished) FILTER (WHERE stat_date >= CURRENT_DATE - %s * INTERVAL '1 day'), 0) AS tests_recent,
            COALESCE(SUM(tests_finished) FILTER (WHERE stat_date <  CURRENT_DATE - %s * INTERVAL '1 day'), 0) AS tests_previous
        FROM daily_stats
        WHERE stat_date >= CURRENT_DATE - %s * INTERVAL '1 day'
        GROUP BY center_id
        HAVING SUM(tests_finished) > 0
    """, (TREND_DAYS, TREND_DAYS, WINDOW_DAYS))

    usage = {}
    for center_id, total_tests, active_days, tests_recent, tests_previous in cursor.fetchall():
        usage[str(center_id)] = {
            "total_tests": int(total_tests),
            "active_days": int(active_days),
            "avg_daily": round(int(total_tests) / int(active_days), 2) if active_days else 0.0,
            "tests_recent": int(tests_recent),
            "tests_previous": int(tests_previous),
        }
    return usage


def passes_floor(u):
    return u["total_tests"] >= MIN_TESTS and u["active_days"] >= MIN_ACTIVE_DAYS


# ────── Percentile ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Percentile (0-1) of a value against a sorted list.
# ── Ties count as half, so tied centers get the same, average percentile (not the lowest one).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def percentile_of(value, sorted_values):
    n = len(sorted_values)
    if n == 0:
        return 1.0
    below = bisect_left(sorted_values, value)
    equal = bisect_right(sorted_values, value) - below
    return (below + 0.5 * equal) / n


# ────── Usage score ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── volume: percentile of total_tests against the eligible pool.
# ── consistency: active_days / WINDOW_DAYS (capped at 1).
# ── trend: recent vs previous half of the window. 0.5 means flat, 1 means double or more, 0 means it dropped to 0.
# ── score = 100 * (WEIGHT_VOLUME * volume + WEIGHT_CONSISTENCY * consistency + WEIGHT_TREND * trend)
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def compute_usage_score(u, sorted_pool_totals):
    volume = percentile_of(u["total_tests"], sorted_pool_totals)
    consistency = min(1.0, u["active_days"] / WINDOW_DAYS)

    if u["tests_previous"] > 0:
        trend = max(0.0, min(1.0, 0.5 * u["tests_recent"] / u["tests_previous"]))
    else:
        trend = 1.0 if u["tests_recent"] > 0 else 0.5

    score = 100 * (WEIGHT_VOLUME * volume + WEIGHT_CONSISTENCY * consistency + WEIGHT_TREND * trend)
    parts = {
        "volume": round(volume, 3),
        "consistency": round(consistency, 3),
        "trend": round(trend, 3),
    }
    return int(round(score)), parts


# ────── Check reasons ───────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Why an opportunity has to be checked before selling (it goes to the Revisar tab). The first one is the main one.
# ── ACCESS_REASONS: the access level of the center when it is not verified (see ops_filter.py).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ACCESS_REASONS = {
    'none': 'no_active_subscription',
    'cancelling': 'cancelled_with_access',
    'unverified': 'access_unverified',
}

REASON_TEXT = {
    'no_active_subscription': "Usa tests sin una suscripción activa",
    'cancelled_with_access': "Canceló, pero sigue con acceso y usando tests",
    'access_unverified': "Tiene acceso, pero no sabemos si su suscripción sigue activa",
    'test_all_unverified': "Tiene test_all en una suscripción sin verificar",
    'had_test_all_before': "Tuvo test_all y sigue usando tests",
}

NO_ACCESS = {"level": 'none', "feature_level": 'none', "had_feature": False}


# ────── Scored pool ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Every center with tests in the window goes to one group (access comes from ops_filter.load_center_access):
# ──   trial access only → skipped (trials are not opportunities).
# ──   verified access and test_all now → 'expansion' (Uso alto con Assessment).
# ──   anything else → 'assessment': verified customers without test_all (Pendientes) or, with check_reasons, Revisar.
# ── The subscription does not decide if a center is in: using tests over the floor in the window is the evidence.
# ── A center without verified access (or with no subscription at all) still goes in, to Revisar with its reason.
# ── Each group is scored against its own pool (also centers below the floor, so open ones can be refreshed/expired).
# ── assessment: eligible = over the floor. priority 'alta' = top percentile of the group, 'media' = the rest.
# ── expansion: eligible = over the floor AND in the top percentile of the group (priority always 'alta').
# ── kind: 'expansion', or 'review' if the center had test_all on any subscription (recovery track), 'upgrade' otherwise.
# ── Returns a dict center_id -> usage + score, parts, group, eligible, priority, kind, access, check_reasons, track_reason.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def classify(cid, access):
    a = access.get(cid, NO_ACCESS)
    level, feature_level = a["level"], a["feature_level"]
    if level == 'trial':
        return None
    if level == 'verified' and feature_level in ('verified', 'trial'):
        return {"group": 'expansion', "kind": 'expansion', "access": level, "check_reasons": []}
    reasons = []
    if level != 'verified':
        reasons.append(ACCESS_REASONS[level])
    if feature_level in ('cancelling', 'unverified'):
        reasons.append('test_all_unverified')
    elif a["had_feature"]:
        reasons.append('had_test_all_before')
    kind = 'review' if a["had_feature"] else 'upgrade'
    return {"group": 'assessment', "kind": kind, "access": level, "check_reasons": reasons}


def score_group(members, scored):
    eligible_ids = [cid for cid, u in members.items() if passes_floor(u)]
    sorted_pool_totals = sorted(members[cid]["total_tests"] for cid in eligible_ids)
    for cid, u in members.items():
        score, parts = compute_usage_score(u, sorted_pool_totals)
        scored[cid].update({"score": score, "score_parts": parts, "eligible": cid in eligible_ids})
    sorted_scores = sorted(scored[cid]["score"] for cid in eligible_ids)
    for cid in members:
        scored[cid]["score_percentile"] = round(percentile_of(scored[cid]["score"], sorted_scores), 3)


def build_scored_pool(usage, access):
    scored, groups = {}, {'assessment': {}, 'expansion': {}}
    for cid, u in usage.items():
        c = classify(cid, access)
        if c:
            scored[cid] = {**u, **c}
            groups[c["group"]][cid] = u

    for members in groups.values():
        score_group(members, scored)

    top_pct = int(round((1 - HIGH_PERCENTILE) * 100))
    for cid, r in scored.items():
        high = r["score_percentile"] >= HIGH_PERCENTILE
        if r["group"] == 'expansion':
            r["eligible"] = r["eligible"] and high
            r["priority"] = 'alta' if r["eligible"] else None
            r["track_reason"] = (f"Uso en el top {top_pct}% de centros con test_all" if r["eligible"]
                                 else "Uso por debajo del top de centros con test_all")
        elif not r["eligible"]:
            r["priority"] = None
            r["track_reason"] = "Uso por debajo del mínimo"
        else:
            r["priority"] = 'alta' if high else 'media'
            r["track_reason"] = (REASON_TEXT[r["check_reasons"][0]] if r["check_reasons"]
                                 else f"Uso en el top {top_pct}% de centros sin test_all" if high
                                 else "Uso constante en plan sin test_all")

    return scored


def thresholds():
    return {
        "window_days": WINDOW_DAYS,
        "min_tests": MIN_TESTS,
        "min_active_days": MIN_ACTIVE_DAYS,
        "high_percentile": HIGH_PERCENTILE,
        "cooldown_days": COOLDOWN_DAYS,
    }
