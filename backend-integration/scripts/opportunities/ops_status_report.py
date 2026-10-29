# ────── Ops API status report (read-only) ───────────────────────────────────────────────────────────────────────────────────────
# ── Pages through the Ops API (no kind filter) and prints which status/kind values exist, how currentPeriodEnd
# ── relates to status, which fields a subscription has, and the raw subscriptions of a few centers to compare.
# ── It never writes anything. Usage: python3 -u ops_status_report.py [center_id ...]
# ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import os
import sys
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import requests
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent.parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)

OPS_API_URL = os.getenv('OPS_API_URL', 'https://api.neuronup.com/ops/subscriptions')
OPS_API_TOKEN = os.getenv('OPS_API_TOKEN')
MAX_PAGES = 1000

# ── The 13 centers whose opportunities expired with a manual subscription (access active, current_state canceled).
DEFAULT_CENTERS = ['147206', '22611', '306', '150983', '36987', '8231', '145043', '150827', '150074',
                   '149888', '29967', '16778', '112074']


def period_bucket(value):
    if not value:
        return "sin fecha"
    try:
        end = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return "futura" if end >= datetime.now(timezone.utc) else "pasada"
    except ValueError:
        return "no parseable"


def main():
    if not OPS_API_TOKEN:
        sys.exit("OPS_API_TOKEN no definido")
    centers = set(sys.argv[1:]) or set(DEFAULT_CENTERS)

    status_c, kind_c, kind_status_c, period_c, manual_c = Counter(), Counter(), Counter(), Counter(), Counter()
    top_keys, center_keys = Counter(), Counter()
    sample, matches, total, page = None, [], 0, 1

    while page <= MAX_PAGES:
        r = requests.get(f"{OPS_API_URL}?page={page}",
                         headers={"X-Api-Token": OPS_API_TOKEN, "Content-Type": "application/json"}, timeout=30)
        if not r.ok:
            sys.exit(f"Página {page} falló: {r.status_code}")
        subs = r.json()
        if not subs:
            break
        for s in subs:
            total += 1
            status, kind = s.get("status"), s.get("kind")
            status_c[status] += 1
            kind_c[kind] += 1
            kind_status_c[(kind, status)] += 1
            period_c[(kind, status, period_bucket(s.get("currentPeriodEnd")))] += 1
            if kind == "manual":
                canceled = "cancelada" if s.get("canceledAt") else "sin cancelar"
                manual_c[(canceled, period_bucket(s.get("currentPeriodEnd")))] += 1
            top_keys.update(s.keys())
            if isinstance(s.get("center"), dict):
                center_keys.update(s["center"].keys())
            if sample is None:
                sample = s
            cid = str((s.get("center") or {}).get("id"))
            if cid in centers:
                matches.append({k: v for k, v in s.items() if k != "features"} | {
                    "features": [f.get("identifier") for f in (s.get("features") or [])]})
        page += 1

    print(f"\nSuscripciones: {total} ({page - 1} páginas)")
    print("\n== status ==")
    for k, v in status_c.most_common():
        print(f"  {k!r}: {v}")
    print("\n== kind ==")
    for k, v in kind_c.most_common():
        print(f"  {k!r}: {v}")
    print("\n== kind x status ==")
    for k, v in sorted(kind_status_c.items(), key=str):
        print(f"  {k}: {v}")
    print("\n== kind x status x currentPeriodEnd ==")
    for k, v in sorted(period_c.items(), key=str):
        print(f"  {k}: {v}")
    print("\n== manual: canceledAt x currentPeriodEnd ==")
    for k, v in sorted(manual_c.items(), key=str):
        print(f"  {k}: {v}")
    print("\n== campos de una suscripción (cuántas los traen) ==")
    for k, v in top_keys.most_common():
        print(f"  {k}: {v}")
    print("\n== campos de center ==")
    for k, v in center_keys.most_common():
        print(f"  {k}: {v}")
    print("\n== ejemplo (sin features) ==")
    print(json.dumps({k: v for k, v in (sample or {}).items() if k != "features"}, ensure_ascii=False, indent=1, default=str))
    print(f"\n== suscripciones de los centros {sorted(centers)} ==")
    for m in sorted(matches, key=lambda x: str((x.get('center') or {}).get('id'))):
        print(json.dumps(m, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
