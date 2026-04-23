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

  #=====================#
 # Initialization: Env #
#=====================#

env_path = Path(__file__).resolve().parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)

AMPLITUDE_API_KEY = os.getenv('AMPLITUDE_API_KEY') 
AMPLITUDE_SECRET_KEY = os.getenv('AMPLITUDE_SECRET_KEY')

  #===========================#
 # Function: Time management #
#===========================#
def get_time_window(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT last_fetch_timestamp FROM fetch_metadata WHERE id = 1")
    result = cursor.fetchone()
    
    if result is None or result[0] is None:
        raise Exception("No last_fetch_timestamp found in DB!")
    
    # result[0] is ALREADY a Python datetime object because Postgres returned a Timestamp!
    last_fetch_dt = result[0]
    
    # We strictly process 24 hours at a time
    end_fetch_dt = last_fetch_dt + timedelta(days=1)
    
    # AMPLITUDE SAFETY CHECK: Is the end date at least 3 hours old?
    if end_fetch_dt > datetime.now() - timedelta(hours=3):
        return None, None
        
    # Convert them into Amplitude's string format ONLY for the API call URL
    return last_fetch_dt.strftime("%Y%m%dT%H"), end_fetch_dt.strftime("%Y%m%dT%H")

  #===========================#
 # Function: Last fetch date #
#===========================#
def update_last_fetch_date(conn, end_time_str):
    # Convert Amplitude's '20260402T00' back into a real Python datetime object
    end_dt = datetime.strptime(end_time_str, "%Y%m%dT%H")
    
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO fetch_metadata (id, last_fetch_timestamp, updated_at)
        VALUES (1, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET
            last_fetch_timestamp = EXCLUDED.last_fetch_timestamp,
            updated_at = NOW()
    """, (end_dt,)) # Notice we are passing the datetime object here!
    conn.commit()

  #=============================#
 # Function: Fetch events file #
#=============================#
def fetch_stream_events(start_str, end_str):
    print("="*80, flush=True)
    print(f"☁️ Fetching Amplitude API: {start_str} to {end_str}...")
    
    url = f'https://analytics.eu.amplitude.com/api/2/export?start={start_str}&end={end_str}' 
    auth = HTTPBasicAuth(AMPLITUDE_API_KEY, AMPLITUDE_SECRET_KEY) 
    response = requests.get(url, auth=auth, stream=True) 
    
    if response.status_code == 404:
        print("⚠️ No data found for this day (404).")
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


  #=============================================#
 # Function: Insert bulk of events to database #
#=============================================#
def process_event_batch(batch, cursor):
    events_to_insert = []

    for event in batch:
        center_id_raw = event.get('groups', {}).get('center_id')
        center_id = center_id_raw[0] if isinstance(center_id_raw, list) and center_id_raw else center_id_raw
        
        event_type = event.get('event_type')
        user_id = event.get('user_id')
        event_timestamp = event.get('event_time')
        event_id_amplitude = event.get('event_id')
        

        event_props = event.get('event_properties') or {}
        patient_id = event_props.get('patient_id')
        session_id = event.get('session_id')
        platform = event.get('platform')
        app_version = event.get('version_name')

        if event_type and center_id and user_id and event_timestamp:
            events_to_insert.append((
                center_id, event_type, user_id, patient_id, 
                event_timestamp, event_id_amplitude,
                json.dumps(event_props), session_id, platform, app_version
            ))

    if not events_to_insert:
        return

    insert_events_query = """
        INSERT INTO events (
            center_id, event_type, user_id, patient_id, 
            event_timestamp, event_id_amplitude, event_properties, 
            session_id, platform, app_version, updated_at
        )
        VALUES %s
        ON CONFLICT (event_id_amplitude) DO NOTHING
    """
    execute_values(cursor, insert_events_query, events_to_insert, template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())")

  #=====================================================#
 # Function: Update daily stats and center total stats #
#=====================================================#
def run_daily_aggregations(cursor, start_str, end_str):

    print(f"🔄 Calculating aggregations for {start_str}...")
    
    start_ts = datetime.strptime(start_str, "%Y%m%dT%H").strftime("%Y-%m-%d %H:%M:%S")
    end_ts = datetime.strptime(end_str, "%Y%m%dT%H").strftime("%Y-%m-%d %H:%M:%S")


    cursor.execute("""
        INSERT INTO center_daily_stats (center_id, date, exercises, sessions, tests_started, tests_finished, activities_started, logins)
        SELECT 
            center_id,
            DATE(event_timestamp) AS date,
            COUNT(*) FILTER (WHERE event_type = 'Exercise - Finished'),
            COUNT(*) FILTER (WHERE event_type = 'Session - Finished'),
            COUNT(*) FILTER (WHERE event_type = 'Test - Started'),
            COUNT(*) FILTER (WHERE event_type = 'Test - Finished'),
            COUNT(*) FILTER (WHERE event_type = 'Activity - Started'),
            COUNT(*) FILTER (WHERE event_type = 'User - Login')
        FROM events
        WHERE event_timestamp >= %s AND event_timestamp < %s
        GROUP BY center_id, DATE(event_timestamp)
        ON CONFLICT (center_id, date) DO UPDATE SET
            exercises = EXCLUDED.exercises,
            sessions = EXCLUDED.sessions,
            tests_started = EXCLUDED.tests_started,
            tests_finished = EXCLUDED.tests_finished,
            activities_started = EXCLUDED.activities_started,
            logins = EXCLUDED.logins;
    """, (start_ts, end_ts))

    cursor.execute("""
        INSERT INTO centers (center_id, total_events, total_exercises, total_sessions, total_logins, last_activity_date, updated_at)
        SELECT 
            center_id,
            COUNT(*) AS total_events,
            COUNT(*) FILTER (WHERE event_type = 'Exercise - Finished') AS total_exercises,
            COUNT(*) FILTER (WHERE event_type = 'Session - Finished') AS total_sessions,
            COUNT(*) FILTER (WHERE event_type = 'User - Login') AS total_logins,
            MAX(DATE(event_timestamp)) AS last_activity_date,
            NOW()
        FROM events
        WHERE event_timestamp >= %s AND event_timestamp < %s
        GROUP BY center_id
        ON CONFLICT (center_id) DO UPDATE SET
            total_events = centers.total_events + EXCLUDED.total_events,
            total_exercises = centers.total_exercises + EXCLUDED.total_exercises,
            total_sessions = centers.total_sessions + EXCLUDED.total_sessions,
            total_logins = centers.total_logins + EXCLUDED.total_logins,
            last_activity_date = GREATEST(centers.last_activity_date, EXCLUDED.last_activity_date),
            updated_at = NOW();
    """, (start_ts, end_ts))

  #================#
 # Main execution #
#================#
if __name__ == "__main__":
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST'), database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'), password=os.getenv('DB_PASSWORD'),
        port=os.getenv('DB_PORT')
    )
    
    # start_str, end_str = get_time_window(conn)
    
    start_str = "20260402T00"
    end_str = "20260403T00"

    
    if not start_str:
        print("⏸️ No new data is ready yet. Exiting gracefully.")
        conn.close()
        exit(0)

    print("="*80)
    print(f"🚀 Starting Daily Run: {start_str} to {end_str}")
    print("="*80)

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

        if total_processed > 0:
            run_daily_aggregations(cursor, start_str, end_str)

        update_last_fetch_date(conn, end_str)
        conn.commit()
        
        print("="*80)
        print(f"✅ Daily Run Complete! Inserted & Aggregated {total_processed} events.")
        print("="*80)

    except Exception as e:
        print("=" * 80)
        print(f"❌ Critical Error: {e}")
        print("=" * 80)
        conn.rollback()
    finally:
        conn.close()