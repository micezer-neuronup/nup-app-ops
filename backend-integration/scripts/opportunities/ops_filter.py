# ────── DOCUMENTED ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
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


def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)


# ────── Ops API features fetch ──────────────────────────────────────────────────────────────────────────────────────────────────
# ── Check the Token to proceed or not.
# ── While pages is <= MAX_PAGES, we fetch all subscriptions in page.
# ── For each sub, we get the id and the features.
# ── Then inside features_map we map each sub id to ites features.
# ── We then increment the page inside the loop to fetch the next page.
# ── When we fetch an empty page, we break the loop.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def fetch_ops_features_map():

    if not OPS_API_TOKEN:
        log("OPS_API_TOKEN not set. Cannot fetch features.", "WARN")
        return None

    features_map = {}
    page = 1

    try:
        while page <= MAX_PAGES:
            r = requests.get(
                f"{OPS_API_URL}?page={page}",
                headers={"X-Api-Token": OPS_API_TOKEN, "Content-Type": "application/json"},
                timeout=30
            )
            if not r.ok:
                log(f"Ops API page {page} failed: {r.status_code}", "WARN")
                return None

            subs = r.json()
            if not subs:
                break 

            for s in subs:
                sub_id = s.get('id')
                feats = {f.get('identifier') for f in (s.get('features') or []) if f.get('identifier')}
                features_map[sub_id] = feats

            page += 1
        
        if page > MAX_PAGES:
            log(f"MAX_PAGES ({MAX_PAGES}) reached — pagination may be incomplete!", "WARN")

        log(f"Ops API: fetched {len(features_map)} subscriptions ({page - 1} pages)")
        return features_map

    except Exception as e:
        log(f"Ops API fetch error: {e}", "WARN")
        return None



# ────── Ops API features fetch ──────────────────────────────────────────────────────────────────────────────────────────────────
# ── The function fetch_ops_features_map is called to obtain the subscriptions features.
# ── We query the subscriptions table to get the backend_subscription_id, current_state and nup_center_id.
# ── For each sub, we get the fetaures from ops_map using the backend_subscription_id as key.
# ── We then get the nup_center_id and store it either on active_set or review_set based on the state.
# ── From review_set we remove the backend_subscription_id that are in active_set(previous subs).
# ── Then return both sets.
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
def get_centers_with_feature(cursor, feature='test_all'):

    ops_map = fetch_ops_features_map()
    if ops_map is None:
        log("Ops API unavailable → fail-open (no centers excluded).", "WARN")
        return set(), set()

    cursor.execute("""
        SELECT nup_center_id, backend_subscription_id, current_state
        FROM subscriptions
        WHERE backend_subscription_id IS NOT NULL
    """)

    subs = cursor.fetchall()

    active_set = set()
    review_set = set()

    for nup_center_id, backend_sub_id, state in subs:
        try:
            key = int(backend_sub_id)
        except (TypeError, ValueError):
            continue
        feats = ops_map.get(key)
        if not feats or feature not in feats:
            continue
        cid = str(nup_center_id)
        if state == 'active':
            active_set.add(cid)
        else:
            review_set.add(cid)

    review_set -= active_set

    log(f"Centros con '{feature}': {len(active_set)} activos, {len(review_set)} no-activos")
    return active_set, review_set