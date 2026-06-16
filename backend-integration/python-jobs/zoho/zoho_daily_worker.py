
import os
import json
import requests
import sqlite3
import time
from pathlib import Path
from dotenv import load_dotenv


# ────── Initialization: Env ──────────────────────────────────
# ─── For development
# ─── Production uses .env.production through docker-compose
# ─────────────────────────────────────────────────────────────
env_path = Path(__file__).resolve().parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)


# ────── Secrets: Zoho Credentials ─────────────────────────────
# ─── For development
# ─── Production uses .env.production through docker-compose
# ─────────────────────────────────────────────────────────────
CLIENT_ID = os.getenv('CLIENT_ID')
CLIENT_SECRET = os.getenv('CLIENT_SECRET')
REFRESH_TOKEN = os.getenv('REFRESH_TOKEN')
ORGANIZATION_ID = os.getenv('ORGANIZATION_ID')


# ────── Urls: Zoho API urls ──────────────────────────────────
# ─── We set base url for the accounts API
# ─── We set base url for the books API
# ─────────────────────────────────────────────────────────────
ACCOUNTS_URL = "https://accounts.zoho.eu/oauth/v2/token"
BOOKS_API_URL = "https://www.zohoapis.eu/books/v3"


# ────── Script Configuration ──────────────────────────────────
# ─── We set the path to the persistent disposable database
# ─── We set the daily limit we want for the updates
# ─────────────────────────────────────────────────────────────
DB_PATH = "/logs/zoho_queue.db" 
DAILY_LIMIT = 2500



# ────── Function: get_new_access_token ──────────────────────────────────
# ─── Refresh Zoho access token
# ─── We set payload for access token request
# ─── Retry logic in case Zoho connection fails
# ────────────────────────────────────────────────────────────────────────
def get_new_access_token():
    
    print("[INFO] [AUTH] Requesting new access token")

    payload = {
        'refresh_token': REFRESH_TOKEN,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'grant_type': 'refresh_token'
    }
    
    for attempt in range(3):
        try:
            response = requests.post(ACCOUNTS_URL, data=payload, timeout=15)
            response.raise_for_status()
            return response.json()['access_token']
            
        except requests.exceptions.RequestException as e:
            print(f"[WARN] [AUTH] Zoho network hiccup (Attempt {attempt + 1}/3): {e}")
            if attempt < 2:
                print("[INFO] [AUTH] Retrying in 10 seconds...")
                time.sleep(10)
            else:
                print("[ERROR] [AUTH] Zoho server not reachable. Aborting.")
                raise e 


# ────── Function: run_daily_batch ──────────────────────────────────────────────
# ─── Reads pending updates from our queue and updates bacth of 2500 invoices
# ─── If no more invoices are remaing we exit the code and log it
# ─── For every successful update, we mark it in the database as done
# ─── For every unsuccessful update, we mark it as failed and log it

# ───────────────────────────────────────────────────────────────────────────────
def run_daily_batch():

    print("[INFO] [ZOHO] Waking up for daily backfill process...")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    

    cursor.execute("""
        SELECT invoice_id, target_nup_center_id 
        FROM pending_updates 
        WHERE status = 'PENDING' 
        LIMIT ?
    """, (DAILY_LIMIT,))
    
    invoices_to_update = cursor.fetchall()
    

    if not invoices_to_update:
        print("[INFO] [ZOHO] No pending invoices found | status=complete")
        conn.close()
        exit(0) 

    total_batch = len(invoices_to_update)
    print(f"[INFO] [ZOHO] Found {total_batch} invoices for today. Starting updates...")
        
    print(f"[INFO] [ZOHO] Batch start | invoices={len(invoices_to_update)}")
    

    token = get_new_access_token()
    headers = {'Authorization': f'Zoho-oauthtoken {token}'}
    
    success_count = 0
    fail_count = 0
    

    for inv_id, nup_id in invoices_to_update:
        url = f"{BOOKS_API_URL}/invoices/{inv_id}?organization_id={ORGANIZATION_ID}"
        

        payload = {
            "custom_fields": [
                {
                    "api_name": "cf_nup_center_id",
                    "value": str(nup_id)
                }
            ]
        }
        
        response = requests.put(url, headers=headers, json=payload)
        
        final_api_left = response.headers.get('X-Rate-Limit-Remaining', 'Unknown')

        if response.status_code in [200, 201]:

            cursor.execute("UPDATE pending_updates SET status = 'COMPLETE' WHERE invoice_id = ?", (inv_id,))
            success_count += 1

        else:

            cursor.execute("UPDATE pending_updates SET status = 'FAILED' WHERE invoice_id = ?", (inv_id,))
            fail_count += 1
            print(f"[ERROR] [ZOHO] Failed to update Invoice {inv_id}: {response.text}")

        conn.commit()

        total_processed = success_count + fail_count

        if total_processed % 500 == 0:
            print(f"[INFO] [ZOHO] Progress: {total_processed}/{total_batch} | API calls remaining today: {final_api_left}")

        time.sleep(0.1) 
        

    
    
    cursor.execute("SELECT COUNT(*) FROM pending_updates WHERE status = 'PENDING'")
    remaining_total = cursor.fetchone()[0]
    
    conn.close()
    
    print("[INFO] [ZOHO] Daily run complete")
    print(f"[INFO] [ZOHO] Updated successfully | count={success_count}")
    print(f"[INFO] [ZOHO] Failed updates | count={fail_count}")
    print(f"[INFO] [ZOHO] Remaining in queue | total={remaining_total}")
    print(f"[INFO] [ZOHO] API calls left today | remaining={final_api_left}", flush=True)



if __name__ == "__main__":
    run_daily_batch()