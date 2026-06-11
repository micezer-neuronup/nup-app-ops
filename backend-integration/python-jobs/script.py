import os
import json
import psycopg2
from datetime import datetime, timedelta
from zipfile import ZipFile
from pathlib import Path
from psycopg2.extras import execute_values
import requests
from requests.auth import HTTPBasicAuth
import gzip
from dotenv import load_dotenv

# ────── Initialization: Env ──────────────────────────────────
env_path = Path(__file__).resolve().parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)

AMPLITUDE_API_KEY = os.getenv('AMPLITUDE_API_KEY') 
AMPLITUDE_SECRET_KEY = os.getenv('AMPLITUDE_SECRET_KEY')

# ────── Lista de Eventos Ignorados (Del Backfill) ────────────
IGNORED_EVENTS = {
    'Exercise - Finished',
    'Start Session',
    'End Session',
    'Search - Input',
    'Page Viewed',
    'Resource - Opened',
    'Activity Preview - Opened',
    'Activity Solution - Opened',
    'Activity Documentation - Opened',
    'Solution - Downloaded',
    'Session - Rated',
    'Resource - Downloaded',
    'Report - Downloaded',
    'Protocol - Finished',
    'Program - Duplicated',
    'Program - Created',
    'Program - Assigned',
    'Activity - Error',
    'Presentation - Started',
    'Activity Video - Opened',
    'Documentation - Downloaded',
    'Session - Generated',
    'Configuration - Created',
    'session_end',
    'session_start',
    'Session - Duplicated',
    'Patient - Created',
    '[Amplitude] Page Viewed',
    'Activity - Rated',
    'Session - Created'
}

def get_time_window(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT last_fetch_timestamp FROM fetch_metadata WHERE id = 1")
    result = cursor.fetchone()
    
    if result is None or result[0] is None:
        raise Exception("No last_fetch_timestamp found in DB!")
    
    last_fetch_dt = result[0]
    end_fetch_dt = last_fetch_dt + timedelta(days=1)
    
    if end_fetch_dt > datetime.now() - timedelta(hours=3):
        return None, None
        
    return last_fetch_dt.strftime("%Y%m%dT%H"), end_fetch_dt.strftime("%Y%m%dT%H")

def update_last_fetch_date(conn, end_time_str):
    end_dt = datetime.strptime(end_time_str, "%Y%m%dT%H")
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO fetch_metadata (id, last_fetch_timestamp, updated_at)
        VALUES (1, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET
            last_fetch_timestamp = EXCLUDED.last_fetch_timestamp,
            updated_at = NOW()
    """, (end_dt,)) 
    conn.commit()

def fetch_stream_events(start_str, end_str):
    print(f"[INFO] [AMPLITUDE] Fetching API data | range={start_str} → {end_str}")
    url = f'https://analytics.eu.amplitude.com/api/2/export?start={start_str}&end={end_str}' 
    auth = HTTPBasicAuth(AMPLITUDE_API_KEY, AMPLITUDE_SECRET_KEY) 
    response = requests.get(url, auth=auth, stream=True) 
    
    if response.status_code == 404:
        print(f"[WARN] [AMPLITUDE] No data found for this day (404) | range={start_str} → {end_str}")
        return
        
    response.raise_for_status() 
    zip_path = 'daily_export.zip'
    
    with open(zip_path, 'wb') as f: 
        for chunk in response.iter_content(chunk_size=8192): 
            f.write(chunk) 

    with ZipFile(zip_path, 'r') as zf:
        for file_name in zf.namelist():
            if file_name.endswith('.gz'):
                with zf.open(file_name) as f:
                    with gzip.GzipFile(fileobj=f) as gz:
                        for line in gz:
                            yield json.loads(line.decode('utf-8').strip())
                            
    if os.path.exists(zip_path):
        os.remove(zip_path)

def process_event_batch(batch, cursor):
    events_to_insert = []

    for event in batch:
        event_type = event.get('event_type')
        
        # Filtramos la basura igual que en el backfill
        if not event_type or event_type in IGNORED_EVENTS:
            continue
            
        center_id_raw = event.get('groups', {}).get('center_id')
        center_id = center_id_raw[0] if isinstance(center_id_raw, list) and center_id_raw else center_id_raw
        
        user_id = event.get('user_id')
        event_timestamp = event.get('event_time')
        event_id_amplitude = event.get('event_id')
        session_id = event.get('session_id')
        device_id = event.get('device_id')
        platform = event.get('platform')

        event_props = event.get('event_properties') or {}
        user_props = event.get('user_properties') or {}
        
        patient_id = event_props.get('patient_id')

        if center_id and user_id and event_timestamp:
            events_to_insert.append((
                event_id_amplitude,
                center_id, 
                user_id, 
                patient_id, 
                event_type,
                event_timestamp, 
                session_id,              
                device_id,
                platform,                
                json.dumps(event_props), 
                json.dumps(user_props) 
            ))

    if not events_to_insert:
        return

    # Inserción con la estructura V2 del backfill
    insert_events_query = """
        INSERT INTO events (
            event_id_amplitude, center_id, user_id, patient_id, 
            event_type, event_timestamp, session_id, device_id, 
            platform, event_properties, user_properties, inserted_at
        )
        VALUES %s
        ON CONFLICT (event_id_amplitude) DO NOTHING
    """
    
    template = "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, NOW())"
    execute_values(cursor, insert_events_query, events_to_insert, template=template)

def run_daily_aggregations(cursor, start_str, end_str):
    print(f"[INFO] [AMPLITUDE] Calculating aggregations & features | date={start_str}")
    
    start_ts = datetime.strptime(start_str, "%Y%m%dT%H").strftime("%Y-%m-%d %H:%M:%S")
    end_ts = datetime.strptime(end_str, "%Y%m%dT%H").strftime("%Y-%m-%d %H:%M:%S")

    # 1. Agregación de daily_stats (Adaptado al esquema de tu dashboard actual)
    cursor.execute("""
        INSERT INTO daily_stats (
            center_id, stat_date, total_logins, activities_started, 
            sessions_assigned, sessions_started, sessions_finished, 
            tests_started, tests_finished, reports_created, 
            exercises_downloaded, materials_downloaded, active_therapists
        )
        SELECT 
            center_id,
            DATE(event_timestamp) AS stat_date,
            COUNT(*) FILTER (WHERE event_type = 'User - Login'),
            COUNT(*) FILTER (WHERE event_type = 'Activity - Started'),
            COUNT(*) FILTER (WHERE event_type = 'Session - Assigned'),
            COUNT(*) FILTER (WHERE event_type = 'Session - Started'),
            COUNT(*) FILTER (WHERE event_type = 'Session - Finished'),
            COUNT(*) FILTER (WHERE event_type = 'Test - Started'),
            COUNT(*) FILTER (WHERE event_type = 'Test - Finished'),
            COUNT(*) FILTER (WHERE event_type = 'Report - Created'),
            COUNT(*) FILTER (WHERE event_type = 'Exercise - Downloaded'),
            COUNT(*) FILTER (WHERE event_type = 'Material - Downloaded'),
            COUNT(DISTINCT user_id)
        FROM events
        WHERE event_timestamp >= %s AND event_timestamp < %s
        GROUP BY center_id, DATE(event_timestamp)
        ON CONFLICT (center_id, stat_date) DO UPDATE SET
            total_logins = EXCLUDED.total_logins,
            activities_started = EXCLUDED.activities_started,
            sessions_assigned = EXCLUDED.sessions_assigned,
            sessions_started = EXCLUDED.sessions_started,
            sessions_finished = EXCLUDED.sessions_finished,
            tests_started = EXCLUDED.tests_started,
            tests_finished = EXCLUDED.tests_finished,
            reports_created = EXCLUDED.reports_created,
            exercises_downloaded = EXCLUDED.exercises_downloaded,
            materials_downloaded = EXCLUDED.materials_downloaded,
            active_therapists = EXCLUDED.active_therapists;
    """, (start_ts, end_ts))

    # 2. Extracción e inserción de Feature Requests
    cursor.execute("""
        INSERT INTO feature_requests (center_id, feature_name, requested_at, status)
        SELECT 
            center_id, 
            event_properties->>'feature_name', 
            event_timestamp, 
            'pending'
        FROM events
        WHERE event_type = 'Features - Request'
          AND event_timestamp >= %s AND event_timestamp < %s
          AND event_properties->>'feature_name' IS NOT NULL
          AND event_properties->>'feature_name' != ''
        -- No ponemos ON CONFLICT porque un centro puede pedir la misma feature en días distintos
    """, (start_ts, end_ts))

if __name__ == "__main__":
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST'), database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'), password=os.getenv('DB_PASSWORD'),
        port=os.getenv('DB_PORT')
    )
    

    start_str, end_str = get_time_window(conn)
    

    # start_str = "20260610T00"
    # end_str = "20260611T00"
    
    if not start_str:
        print("[INFO] [AMPLITUDE] No new data ready yet. Exiting gracefully.")
        conn.close()
        exit(0)

    print(f"[INFO] [AMPLITUDE] Starting daily run | range={start_str} → {end_str}")

    try:
        cursor = conn.cursor()
        event_batch = []
        BATCH_SIZE = 5000
        total_processed = 0

        for event in fetch_stream_events(start_str, end_str):
            event_batch.append(event)
            total_processed += 1
            
            if len(event_batch) >= BATCH_SIZE:
                process_event_batch(event_batch, cursor)
                event_batch.clear()
        
        if event_batch:
            process_event_batch(event_batch, cursor)

        # Hacemos el commit de los eventos antes de calcular los totales
        conn.commit()

        if total_processed > 0:
            run_daily_aggregations(cursor, start_str, end_str)

        # update_last_fetch_date(conn, end_str) # Comentado temporalmente si vas en modo manual
        
        conn.commit()
        print(f"[INFO] [AMPLITUDE] Daily run complete | processed={total_processed}")

    except Exception as e:
        print(f"[ERROR] [AMPLITUDE] Critical error | error={e}")
        conn.rollback()
    finally:
        conn.close()