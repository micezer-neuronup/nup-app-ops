import os
import requests
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# ────── Env ────────────────────────────────────────────────────────────────────
env_path = Path(__file__).resolve().parent.parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)

OPS_API_URL = os.getenv('OPS_API_URL', 'https://api.neuronup.com/ops/subscriptions')
OPS_API_TOKEN = os.getenv('OPS_API_TOKEN')

MAX_PAGES = 400  # safety limit


def log(msg, level="INFO"):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{level}] {msg}", flush=True)


# ────── Ops API fetch ──────────────────────────────────────────────────────────
def fetch_ops_features_map():
    """
    Paginate Ops API, return {ops_subscription_id: set(feature_identifiers)}.
    Returns None on any failure (caller should fail-open).
    """
    if not OPS_API_TOKEN:
        log("OPS_API_TOKEN not set. Cannot fetch features.", "WARN")
        return None

    features_map = {}
    page = 1

    try:
        while page <= MAX_PAGES:
            r = requests.get(
                f"{OPS_API_URL}?page={page}&kind=stripe",
                headers={"X-Api-Token": OPS_API_TOKEN, "Content-Type": "application/json"},
                timeout=30
            )
            if not r.ok:
                log(f"Ops API page {page} failed: {r.status_code}", "WARN")
                return None

            subs = r.json()
            if not subs:
                break  # no more pages

            for s in subs:
                sub_id = s.get('id')
                feats = {f.get('identifier') for f in (s.get('features') or []) if f.get('identifier')}
                features_map[sub_id] = feats

            page += 1

        log(f"Ops API: fetched {len(features_map)} subscriptions ({page - 1} pages)")
        return features_map

    except Exception as e:
        log(f"Ops API fetch error: {e}", "WARN")
        return None


# ────── Paying centers ─────────────────────────────────────────────────────────
def get_paying_centers(cursor, feature='test_all'):
    """
    Returns set of nup_center_id (as str) that currently pay for `feature`.
    Active subs only, per our DB (current_state = 'active').
    On Ops API failure → returns empty set (fail-open: nothing excluded).
    """
    ops_map = fetch_ops_features_map()
    if ops_map is None:
        log("Ops API unavailable → fail-open (no centers excluded).", "WARN")
        return set()

    cursor.execute("""
        SELECT nup_center_id, backend_subscription_id
        FROM subscriptions
        WHERE current_state = 'active'
          AND backend_subscription_id IS NOT NULL
    """)
    active_subs = cursor.fetchall()

    paying = set()
    for nup_center_id, backend_sub_id in active_subs:
        # backend_subscription_id is varchar; Ops API id is int → normalize
        try:
            key = int(backend_sub_id)
        except (TypeError, ValueError):
            continue
        feats = ops_map.get(key)
        if feats and feature in feats:
            paying.add(str(nup_center_id))

    log(f"Paying centers (with '{feature}'): {len(paying)}")
    return paying