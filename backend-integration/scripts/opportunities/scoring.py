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


# ────── Scored pool ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── The eligible pool: current customers, without the feature now, with usage over the floor.
# ── We score every customer without the feature (also those below the floor, so pending ones can be refreshed/expired).
# ── Then we calculate the percentile of each score inside the eligible pool to assign the priority.
# ── kind: 'review' if the center had the feature before (recovery track), 'upgrade' otherwise.
# ── Returns a dict center_id -> usage + score, parts, eligible, priority, kind, track_reason.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def build_scored_pool(usage, customers, has_feature_now, had_feature_before):
    candidates = {
        cid: u for cid, u in usage.items()
        if cid in customers and cid not in has_feature_now
    }
    eligible_ids = [cid for cid, u in candidates.items() if passes_floor(u)]
    sorted_pool_totals = sorted(candidates[cid]["total_tests"] for cid in eligible_ids)

    scored = {}
    for cid, u in candidates.items():
        score, parts = compute_usage_score(u, sorted_pool_totals)
        scored[cid] = {**u, "score": score, "score_parts": parts, "eligible": cid in eligible_ids}

    sorted_scores = sorted(scored[cid]["score"] for cid in eligible_ids)
    top_pct = int(round((1 - HIGH_PERCENTILE) * 100))

    for cid, r in scored.items():
        r["kind"] = 'review' if cid in had_feature_before else 'upgrade'
        r["score_percentile"] = round(percentile_of(r["score"], sorted_scores), 3)

        if not r["eligible"]:
            r["priority"] = None
            r["track_reason"] = "Uso por debajo del mínimo"
        elif r["score_percentile"] >= HIGH_PERCENTILE:
            r["priority"] = 'alta'
            r["track_reason"] = f"Uso en el top {top_pct}% de centros sin test_all"
        else:
            r["priority"] = 'media'
            r["track_reason"] = "Uso constante en plan sin test_all"

        if r["eligible"] and r["kind"] == 'review':
            r["track_reason"] = "Tuvo test_all y sigue usando tests"

    return scored


def thresholds():
    return {
        "window_days": WINDOW_DAYS,
        "min_tests": MIN_TESTS,
        "min_active_days": MIN_ACTIVE_DAYS,
        "high_percentile": HIGH_PERCENTILE,
        "cooldown_days": COOLDOWN_DAYS,
    }
