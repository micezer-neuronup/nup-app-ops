# ────── Documented ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Assessment pools: how a center with tests is classified (see shared/scoring.py for the score itself).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
from shared.scoring import (score_group, ACCESS_REASONS, NO_ACCESS, HIGH_PERCENTILE, WINDOW_DAYS, MIN_TESTS,
                            MIN_ACTIVE_DAYS, COOLDOWN_DAYS)


# ────── Check reasons ───────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Why an opportunity has to be checked before selling (it goes to the Revisar tab). The first one is the main one.
# ── ACCESS_REASONS (shared/scoring.py): the access level of the center when it is not verified (see ops_filter.py).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
REASON_TEXT = {
    'no_active_subscription': "Usa tests sin una suscripción activa",
    'cancelled_with_access': "Canceló, pero sigue con acceso y usando tests",
    'access_unverified': "Tiene acceso, pero no sabemos si su suscripción sigue activa",
    'test_all_unverified': "Tiene test_all en una suscripción sin verificar",
    'had_test_all_before': "Tuvo test_all y sigue usando tests",
}

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
