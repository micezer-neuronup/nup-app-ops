
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



# ────── Function: get_new_access_token ──────────────────────────────────
# ─── Refresh Zoho access token
# ─── We set payload for access token request
# ─────────────────────────────────────────────────────────────
def get_new_access_token():
    
    print("[INFO] [AUTH] Requesting new access token")

    payload = {
        'refresh_token': REFRESH_TOKEN,
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'grant_type': 'refresh_token'
    }
    
    response = requests.post(ACCOUNTS_URL, data=payload)
    response.raise_for_status()
    
    data = response.json()

    if 'access_token' in data:
        print("[INFO] [AUTH] Access token generated successfully")
        return data['access_token']
    else:
        raise Exception(f"[ERROR] [AUTH] Failed to get token | data={data}")



# ────── Function: extract_nup_id ──────────────────────────────────
# ─── We extract and return tne client nup_center id
# ─────────────────────────────────────────────────────────────
def extract_nup_id(custom_fields):

    for field in custom_fields:
        if field.get('api_name') == 'cf_nup_center_id':
            return field.get('value')
    return None


# ────── Function: setup_database ──────────────────────────────────
# ─── We create the disposable database 
# ─── We use the persistent wormhole we mad efor the logs
# ──────────────────────────────────────────────────────────────────
def setup_database():

    conn = sqlite3.connect('/logs/zoho_queue.db')
    cursor = conn.cursor()
    

    cursor.execute('''CREATE TABLE IF NOT EXISTS customers (
                        customer_id TEXT PRIMARY KEY,
                        nup_center_id TEXT
                    )''')
    

    cursor.execute('''CREATE TABLE IF NOT EXISTS invoices (
                        invoice_id TEXT PRIMARY KEY,
                        customer_id TEXT,
                        nup_center_id TEXT
                    )''')
                    

    cursor.execute('''CREATE TABLE IF NOT EXISTS pending_updates (
                        invoice_id TEXT PRIMARY KEY,
                        target_nup_center_id TEXT,
                        status TEXT DEFAULT 'PENDING'
                    )''')
    conn.commit()
    return conn



# ────── Function: fetch_all_records ──────────────────────────────────
# ─── We fetch all the records exploiting bulk method (pagination)
# ─── We use the persistent wormhole we made for the logs
# ──────────────────────────────────────────────────────────────────
def fetch_all_records(access_token, conn, endpoint, table_name, id_key):

    cursor = conn.cursor()
    page = 1
    has_more_page = True
    headers = {'Authorization': f'Zoho-oauthtoken {access_token}'}
    
    print(f"\n[INFO] [AMPLITUDE] Downloading table | name={table_name}", flush=True)
    
    while has_more_page:
        params = {
            'organization_id': ORGANIZATION_ID,
            'page': page,
            'per_page': 200
        }
        
        if endpoint == 'contacts':
            params['contact_type'] = 'customer'
            
        response = requests.get(f"{BOOKS_API_URL}/{endpoint}", headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        
        api_left = response.headers.get('X-Rate-Limit-Remaining', 'Unknown')
        
        records = data.get(endpoint, [])
        
        for record in records:
            record_id = record.get(id_key)
            customer_id = record.get('customer_id') if endpoint == 'invoices' else record_id
            
            nup_id = extract_nup_id(record.get('custom_fields', []))
            
            if endpoint == 'contacts':
                cursor.execute("INSERT OR REPLACE INTO customers (customer_id, nup_center_id) VALUES (?, ?)", 
                               (record_id, nup_id))
            else:
                cursor.execute("INSERT OR REPLACE INTO invoices (invoice_id, customer_id, nup_center_id) VALUES (?, ?, ?)", 
                               (record_id, customer_id, nup_id))
        
        conn.commit()

        print(f"[INFO] [AMPLITUDE] Page saved | page={page} api_remaining={api_left}")
        
        page_context = data.get('page_context', {})
        has_more_page = page_context.get('has_more_page', False)
        page += 1



def build_update_queue(conn):
    """Finds invoices missing an ID where the customer HAS an ID."""
    print("\n[INFO] [AMPLITUDE] Analyzing relationships and building To-Do list")
    cursor = conn.cursor()
    
    # Empty the queue just in case we are re-running this script
    cursor.execute("DELETE FROM pending_updates")
    
    # The Magic SQL Query
    cursor.execute("""
        INSERT INTO pending_updates (invoice_id, target_nup_center_id, status)
        SELECT 
            i.invoice_id, 
            c.nup_center_id, 
            'PENDING'
        FROM invoices i
        JOIN customers c ON i.customer_id = c.customer_id
        WHERE (i.nup_center_id IS NULL OR i.nup_center_id = '')
          AND (c.nup_center_id IS NOT NULL AND c.nup_center_id != '')
    """)
    
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM pending_updates")
    total_to_update = cursor.fetchone()[0]
    print("[INFO] [ANALYTICS] Analysis complete", flush=True)
    print(f"[INFO] [ANALYTICS] Invoices to update | total={total_to_update}", flush=True)

if __name__ == "__main__":
    token = get_new_access_token()
    db_conn = setup_database()
    
    # 1. Download Customers
    fetch_all_records(token, db_conn, 'contacts', 'customers', 'contact_id')
    
    # 2. Download Invoices
    fetch_all_records(token, db_conn, 'invoices', 'invoices', 'invoice_id')
    
    # 3. Build the Target List
    build_update_queue(db_conn)
    
    db_conn.close()
    print("\n[INFO] [SETUP] Setup finished | db=zoho_queue.db ready for daily worker", flush=True)
