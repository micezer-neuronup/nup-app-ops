# ────── Documented ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import os
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# ────── Env configuration ───────────────────────────────────────────────────────────────────────────────────────────────────────
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
env_path = Path(__file__).resolve().parent.parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)

# ────── Ops API configuration ───────────────────────────────────────────────────────────────────────────────────────────────────
# ── Url to the subscripcions endpoint
# ── API Token for authentication
# ── MAX_PAGES is set to limit the amount of pages we fetch.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
OPS_API_URL = os.getenv('OPS_API_URL', 'https://api.neuronup.com/ops/subscriptions')
OPS_API_TOKEN = os.getenv('OPS_API_TOKEN')
MAX_PAGES = 1000 

# ────── Access levels ───────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── Every subscription gets one access level. A center takes the best level of all its subscriptions.
# ── Stripe: current_state from the subscriptions table is reliable (active/past_due → verified, trial → trial).
# ── Manual: current_state is inferred from dates that are often outdated, and the Ops API status is only the
# ── type of access (active/trial), never cancelled. So we read the Ops API payload directly:
# ──   canceledAt set and the period already ended (or no date) → none (cancelled).
# ──   canceledAt set but the period still running            → cancelling (cancelled, still has access).
# ──   not cancelled and period in the future or no date      → verified (trial if status is trial).
# ──   not cancelled and period already ended                 → unverified (has access, state unknown).
# ── canceledAt can also be outdated: a center that uses tests goes in whatever its level, the level only says
# ── what has to be checked (see scoring.py).
# ── LEVEL_RANK orders the levels to pick the best one per center.
# ── FEATURE_NOW_LEVELS: levels where the center can use the feature today and we trust it (has it now).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
LEVEL_RANK = {'verified': 4, 'cancelling': 3, 'unverified': 2, 'trial': 1, 'none': 0}
FEATURE_NOW_LEVELS = {'verified', 'trial'}
STRIPE_VERIFIED_STATES = {'active', 'past_due'}


class OpsApiError(Exception):
    pass


def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)


def parse_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        return None


# ────── Ops API subscriptions fetch ─────────────────────────────────────────────────────────────────────────────────────────────
# ── Check the Token to proceed or not.
# ── While pages is <= MAX_PAGES, we fetch all subscriptions in page (no kind filter: we want all of them).
# ── For each sub we keep what we need: kind, status, center id, canceledAt, currentPeriodEnd and the features.
# ── We then increment the page inside the loop to fetch the next page.
# ── When we fetch an empty page, we break the loop.
# ── Any failure (no token, failed page, exception, MAX_PAGES reached) raises OpsApiError so the caller stops.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def fetch_ops_subscriptions():

    if not OPS_API_TOKEN:
        raise OpsApiError("OPS_API_TOKEN not set. Cannot fetch features.")

    subscriptions = {}
    page = 1

    try:
        while page <= MAX_PAGES:
            r = requests.get(
                f"{OPS_API_URL}?page={page}",
                headers={"X-Api-Token": OPS_API_TOKEN, "Content-Type": "application/json"},
                timeout=30
            )
            if not r.ok:
                raise OpsApiError(f"Ops API page {page} failed: {r.status_code}")

            subs = r.json()
            if not subs:
                break 

            for s in subs:
                subscriptions[s.get('id')] = {
                    "kind": s.get('kind'),
                    "status": s.get('status'),
                    "center_id": str((s.get('center') or {}).get('id')),
                    "canceled_at": parse_date(s.get('canceledAt')),
                    "period_end": parse_date(s.get('currentPeriodEnd')),
                    "features": {f.get('identifier') for f in (s.get('features') or []) if f.get('identifier')},
                }

            page += 1
        
        if page > MAX_PAGES:
            raise OpsApiError(f"MAX_PAGES ({MAX_PAGES}) reached — pagination may be incomplete!")

        log(f"Ops API: fetched {len(subscriptions)} subscriptions ({page - 1} pages)")
        return subscriptions

    except OpsApiError:
        raise
    except Exception as e:
        raise OpsApiError(f"Ops API fetch error: {e}") from e


def manual_level(sub, today):
    if sub["canceled_at"]:
        return 'cancelling' if sub["period_end"] and sub["period_end"] >= today else 'none'
    if sub["period_end"] is None or sub["period_end"] >= today:
        return 'trial' if sub["status"] == 'trial' else 'verified'
    return 'unverified'


def stripe_level(state):
    if state in STRIPE_VERIFIED_STATES:
        return 'verified'
    return 'trial' if state == 'trial' else 'none'


# ────── Center access ───────────────────────────────────────────────────────────────────────────────────────────────────────────
# ── fetch_ops_subscriptions is called to obtain every subscription with its features.
# ── For stripe subs we read current_state from the subscriptions table (backend_subscription_id = Ops id).
# ── For manual subs we use manual_level with the Ops API payload (see Access levels above).
# ── Per center we keep:
# ──   level: the best access level of all its subscriptions.
# ──   feature_level: the best access level of the subscriptions that include the feature.
# ──   had_feature: the feature is (or was) on any of its subscriptions.
# ── If the Ops API fails, OpsApiError propagates: we never continue without knowing who has test_all (fail-closed).
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def load_center_access(cursor, feature='test_all'):

    ops_subs = fetch_ops_subscriptions()

    cursor.execute("""
        SELECT backend_subscription_id, current_state
        FROM subscriptions
        WHERE backend_subscription_id IS NOT NULL AND source <> 'backend'
    """)
    stripe_states = {}
    for backend_sub_id, state in cursor.fetchall():
        try:
            stripe_states[int(backend_sub_id)] = state
        except (TypeError, ValueError):
            continue

    today = datetime.now().date()
    access = {}
    for sub_id, sub in ops_subs.items():
        if sub["center_id"] in (None, 'None'):
            continue
        level = manual_level(sub, today) if sub["kind"] == 'manual' else stripe_level(stripe_states.get(sub_id))
        a = access.setdefault(sub["center_id"], {"level": 'none', "feature_level": 'none', "had_feature": False})
        if LEVEL_RANK[level] > LEVEL_RANK[a["level"]]:
            a["level"] = level
        if feature in sub["features"]:
            a["had_feature"] = True
            if LEVEL_RANK[level] > LEVEL_RANK[a["feature_level"]]:
                a["feature_level"] = level

    by_level = {}
    for a in access.values():
        by_level[a["level"]] = by_level.get(a["level"], 0) + 1
    has_now = sum(1 for a in access.values() if a["feature_level"] in FEATURE_NOW_LEVELS)
    log(f"Acceso por centro: {by_level} | Con '{feature}' ahora: {has_now}")
    return access


# ── Centers that have the feature today on a subscription we trust (the daily job marks them 'converted').
def centers_with_feature_now(access):
    return {cid for cid, a in access.items() if a["feature_level"] in FEATURE_NOW_LEVELS}
