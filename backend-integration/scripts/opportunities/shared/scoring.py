# ────── Documented ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Shared usage scoring for every opportunities module (assessment, sessions...).
# ── Each module scores one daily_stats column (metric): assessment uses tests_finished, sessions uses sessions_finished.
# ── prefix names the keys of the usage dict: total_<prefix>, <prefix>_recent, <prefix>_previous (tests → total_tests...).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
from bisect import bisect_left, bisect_right


# ────── Script configuration ────────────────────────────────────────────────────────────────────────────────────────────────────
# ── WINDOW_DAYS: backtrack window to check the activity.
# ── TREND_DAYS: the window is split in two halves of TREND_DAYS to compare recent vs previous usage.
# ── MIN_TESTS / MIN_ACTIVE_DAYS: usage floor. A center below it is not an opportunity (and pending ones expire).
# ──   MIN_TESTS is the minimum count of the metric (tests for assessment, sessions for sessions).
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
# ── active_days only counts days with the metric > 0 (not days with any activity).
# ── <prefix>_recent is the last TREND_DAYS, <prefix>_previous the TREND_DAYS before.
# ── METRICS is the whitelist of columns that can be scored (the column name goes into the SQL).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
METRICS = {'tests_finished': 'tests', 'sessions_finished': 'sessions'}


def fetch_usage(cursor, metric='tests_finished'):
    prefix = METRICS[metric]
    cursor.execute(f"""
        SELECT
            center_id,
            SUM({metric}) AS total,
            COUNT(DISTINCT stat_date) FILTER (WHERE {metric} > 0) AS active_days,
            COALESCE(SUM({metric}) FILTER (WHERE stat_date >= CURRENT_DATE - %s * INTERVAL '1 day'), 0) AS recent,
            COALESCE(SUM({metric}) FILTER (WHERE stat_date <  CURRENT_DATE - %s * INTERVAL '1 day'), 0) AS previous
        FROM daily_stats
        WHERE stat_date >= CURRENT_DATE - %s * INTERVAL '1 day'
        GROUP BY center_id
        HAVING SUM({metric}) > 0
    """, (TREND_DAYS, TREND_DAYS, WINDOW_DAYS))

    usage = {}
    for center_id, total, active_days, recent, previous in cursor.fetchall():
        usage[str(center_id)] = {
            f"total_{prefix}": int(total),
            "active_days": int(active_days),
            "avg_daily": round(int(total) / int(active_days), 2) if active_days else 0.0,
            f"{prefix}_recent": int(recent),
            f"{prefix}_previous": int(previous),
        }
    return usage


def passes_floor(u, prefix='tests'):
    return u[f"total_{prefix}"] >= MIN_TESTS and u["active_days"] >= MIN_ACTIVE_DAYS


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
# ── volume: percentile of total_<prefix> against the eligible pool.
# ── consistency: active_days / WINDOW_DAYS (capped at 1).
# ── trend: recent vs previous half of the window. 0.5 means flat, 1 means double or more, 0 means it dropped to 0.
# ── score = 100 * (WEIGHT_VOLUME * volume + WEIGHT_CONSISTENCY * consistency + WEIGHT_TREND * trend)
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def compute_usage_score(u, sorted_pool_totals, prefix='tests'):
    volume = percentile_of(u[f"total_{prefix}"], sorted_pool_totals)
    consistency = min(1.0, u["active_days"] / WINDOW_DAYS)
    recent, previous = u[f"{prefix}_recent"], u[f"{prefix}_previous"]

    if previous > 0:
        trend = max(0.0, min(1.0, 0.5 * recent / previous))
    else:
        trend = 1.0 if recent > 0 else 0.5

    score = 100 * (WEIGHT_VOLUME * volume + WEIGHT_CONSISTENCY * consistency + WEIGHT_TREND * trend)
    parts = {
        "volume": round(volume, 3),
        "consistency": round(consistency, 3),
        "trend": round(trend, 3),
    }
    return int(round(score)), parts


# ────── Group scoring ───────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Scores every member of a group against the eligible ones (over the floor) of the same group.
# ── scored[cid] gets score, score_parts, eligible and score_percentile (percentile of the score inside the group).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def score_group(members, scored, prefix='tests'):
    eligible_ids = [cid for cid, u in members.items() if passes_floor(u, prefix)]
    sorted_pool_totals = sorted(members[cid][f"total_{prefix}"] for cid in eligible_ids)
    for cid, u in members.items():
        score, parts = compute_usage_score(u, sorted_pool_totals, prefix)
        scored[cid].update({"score": score, "score_parts": parts, "eligible": cid in eligible_ids})
    sorted_scores = sorted(scored[cid]["score"] for cid in eligible_ids)
    for cid in members:
        scored[cid]["score_percentile"] = round(percentile_of(scored[cid]["score"], sorted_scores), 3)


# ────── Access reasons ──────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Why an opportunity has to be checked before selling, by the access level of the center when it is not verified
# ── (see ops_filter.py). Shared by every module; each module adds its own reasons.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
ACCESS_REASONS = {
    'none': 'no_active_subscription',
    'cancelling': 'cancelled_with_access',
    'unverified': 'access_unverified',
}

NO_ACCESS = {"level": 'none', "feature_level": 'none', "had_feature": False}
