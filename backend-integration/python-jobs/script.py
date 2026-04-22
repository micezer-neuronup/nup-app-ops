import os
import json
import psycopg2
import time
from datetime import datetime
from zipfile import ZipFile
from pathlib import Path
from psycopg2.extras import execute_values
import requests
from requests.auth import HTTPBasicAuth
from dotenv import load_dotenv
env_path = Path(__file__).resolve().parent.parent /".env.development"
load_dotenv(dotenv_path=env_path)
import gzip

SIMULATION_MODE = os.getenv('SIMULATION_MODE') == 'True'
AMPLITUDE_API_KEY = os.getenv('AMPLITUDE_API_KEY') 
AMPLITUDE_SECRET_KEY = os.getenv('AMPLITUDE_SECRET_KEY')

print(f"SIMULATION_MODE = {SIMULATION_MODE}")  # Verifica que sea True


#--------------------------------------------------------------------------------------------------------------

"""
Functions to get the time range for the api call.
Should store the date/time of the last fetch to obtain start_date
Should store the date/time of the actual fetch to obtain end_date
Amplitude API uses ISO fomrat to define date range, so we map the date to iso format.
"""
def get_last_fetch(conn):
    cursor = conn.cursor()
    cursor.execute("SELECT last_fetch_timestamp FROM fetch_metadata WHERE id = 1")
    result = cursor.fetchone()
    
    if result is None or result[0] is None:
        return "20260310T00"
    
    return result[0].strftime("%Y%m%dT%H")

def get_fetch_times():
    ts = time.time()
    fetch_time_ts = datetime.fromtimestamp(ts)
    fetch_time_iso_format = fetch_time_ts.strftime("%Y%m%dT%H")

    times_ts_iso = fetch_time_ts, fetch_time_iso_format
    return(times_ts_iso)

def update_last_fetch_date(conn, fetch_time):
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO fetch_metadata (id, last_fetch_timestamp, updated_at)
        VALUES (1, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET
            last_fetch_timestamp = EXCLUDED.last_fetch_timestamp,
            updated_at = NOW()
    """, (fetch_time,))
    conn.commit()
    print("="*80, flush=True)
    print("Last fetch updated in database")
    print("="*80, flush=True)


#--------------------------------------------------------------------------------------------------------------

#ZIP_PATH = '/app/python-jobs/export.zip'
#ZIP_PATH = Path(__file__).parent / 'export.zip'


# Pasar last_fetch_time y fetch_time[1]
def fetch_stream_events(last_fetch_time, fetch_time):
    if SIMULATION_MODE:
        print("="*80, flush=True)
        print("SIM: Reading local json file for simulation...")
        print("="*80, flush=True)
        # Your simulation logic here...
    else:
        print("="*80, flush=True)
        print(f"PROD TEST: Bypassing API fetch for ({last_fetch_time} to {fetch_time}).")
        print("PROD TEST: Reading directly from local 'test_export.zip'...")
        print("="*80, flush=True)
        
        zip_path = 'test_export.zip'
        
        if not os.path.exists(zip_path):
            print(f"❌ ERROR: '{zip_path}' not found in the current directory.")
            return

        # Open the zip and process the nested .gz files
        with ZipFile(zip_path, 'r') as zf:
            for file_name in zf.namelist():
                # Amplitude files inside the zip end in .json.gz
                if file_name.endswith('.gz'):
                    with zf.open(file_name) as f:
                        # Decompress the gzip file on the fly
                        with gzip.GzipFile(fileobj=f) as gz:
                            for line in gz:
                                # Decode the bytes and parse the JSON
                                yield json.loads(line.decode('utf-8').strip())




"""
Takes an event in json format and insert it to postgres
Recieves and event and a connection from database
We will extract data base on my schema events

"""


def update_daily_stats_batch(cursor, batch):
    daily_stats_updates = {}
    
    col_map = {
        'Exercise - Finished': 'exercises',
        'Session - Finished': 'sessions',
        'Test - Started': 'tests_started',
        'Test - Finished': 'tests_finished',
        'Activity - Started': 'activities_started',
        'User - Login': 'logins'
    }
    
    # 1. AGGREGATE IN PYTHON MEMORY
    for event in batch:
        event_type = event.get('event_type')
        col = col_map.get(event_type)
        
        # If it's not an event we care about for daily stats, skip it
        if not col:
            continue
            
        center_id_raw = event.get('groups', {}).get('center_id')
        center_id = center_id_raw[0] if isinstance(center_id_raw, list) and center_id_raw else center_id_raw
        
        event_timestamp = event.get('event_time')
        event_date = event_timestamp[:10] if event_timestamp else None
        
        if not center_id or not event_date:
            continue
            
        # Our unique key for aggregation is the combination of Center and Date
        key = (center_id, event_date)
        
        if key not in daily_stats_updates:
            # Initialize the counters for this specific center on this specific date
            daily_stats_updates[key] = {
                'exercises': 0, 'sessions': 0, 'tests_started': 0,
                'tests_finished': 0, 'activities_started': 0, 'logins': 0
            }
            
        # Increment the correct column counter
        daily_stats_updates[key][col] += 1
        
    # If there are no stats to update in this batch, exit early
    if not daily_stats_updates:
        return
        
    # 2. PREPARE THE TUPLES FOR BULK INSERT
    stats_to_upsert = []
    for (cid, edate), counts in daily_stats_updates.items():
        stats_to_upsert.append((
            cid, edate, 
            counts['exercises'], counts['sessions'], 
            counts['tests_started'], counts['tests_finished'], 
            counts['activities_started'], counts['logins']
        ))
        
    # 3. BULK UPSERT INTO POSTGRES
    insert_stats_query = """
        INSERT INTO center_daily_stats (
            center_id, date, exercises, sessions, 
            tests_started, tests_finished, activities_started, logins
        ) VALUES %s
        ON CONFLICT (center_id, date) DO UPDATE SET
            exercises = center_daily_stats.exercises + EXCLUDED.exercises,
            sessions = center_daily_stats.sessions + EXCLUDED.sessions,
            tests_started = center_daily_stats.tests_started + EXCLUDED.tests_started,
            tests_finished = center_daily_stats.tests_finished + EXCLUDED.tests_finished,
            activities_started = center_daily_stats.activities_started + EXCLUDED.activities_started,
            logins = center_daily_stats.logins + EXCLUDED.logins
    """
    
    # execute_values dynamically handles the list of tuples
    execute_values(cursor, insert_stats_query, stats_to_upsert)

def process_event_batch(batch, conn):
    try:
        cursor = conn.cursor()

        events_to_insert = []
        # We will use a dictionary to aggregate center updates in memory
        center_updates = {} 

        # 1. PREPARE THE DATA IN PYTHON
        for event in batch:
            center_id_raw = event.get('groups', {}).get('center_id')
            center_id = center_id_raw[0] if isinstance(center_id_raw, list) and center_id_raw else center_id_raw
            
            event_type = event.get('event_type')
            user_id = event.get('user_id')
            patient_id = event.get('event_properties', {}).get('patient_id')
            event_timestamp = event.get('event_time')
            event_id_amplitude = event.get('event_id')
            
            # Convertir timestamp a date 
            event_date = event_timestamp[:10] if event_timestamp else None

            if event_type and center_id and user_id and event_timestamp:
                # Add to our events list as a tuple
                events_to_insert.append((
                    center_id, event_type, user_id, patient_id, 
                    event_timestamp, event_id_amplitude, json.dumps(event)
                ))

                # Aggregate the center totals in memory
                if center_id not in center_updates:
                    center_updates[center_id] = {
                        'total_events': 0, 'Exercise - Finished': 0, 
                        'Session - Created': 0, 'Session - Started': 0, 
                        'Session - Finished': 0, 'User - Login': 0
                    }
                
                center_updates[center_id]['total_events'] += 1
                if event_type in center_updates[center_id]:
                    center_updates[center_id][event_type] += 1

        # If there's nothing to insert, skip the DB call
        if not events_to_insert:
            return

        # 2. BULK INSERT INTO EVENTS TABLE
        insert_events_query = """
            INSERT INTO events (center_id, event_type, user_id, patient_id, event_timestamp, event_id_amplitude, raw_data, updated_at)
            VALUES %s
        """
        # execute_values handles the formatting of the huge list of tuples
        execute_values(cursor, insert_events_query, events_to_insert, template="(%s, %s, %s, %s, %s, %s, %s, NOW())")

        # 3. BULK UPSERT INTO CENTERS TABLE
        centers_to_upsert = []
        for cid, counts in center_updates.items():
            # Combine the session fields
            total_sessions = counts['Session - Created'] + counts['Session - Started'] + counts['Session - Finished']
            
            centers_to_upsert.append((
                cid, 
                counts['total_events'], 
                counts['Exercise - Finished'], 
                total_sessions, 
                counts['User - Login']
            ))

        insert_centers_query = """
            INSERT INTO centers (center_id, total_events, total_exercises, total_sessions, total_logins, last_activity_date, updated_at)
            VALUES %s
            ON CONFLICT (center_id) DO UPDATE SET
                total_events = centers.total_events + EXCLUDED.total_events,
                total_exercises = centers.total_exercises + EXCLUDED.total_exercises,
                total_sessions = centers.total_sessions + EXCLUDED.total_sessions,
                total_logins = centers.total_logins + EXCLUDED.total_logins,
                last_activity_date = CURRENT_DATE,
                updated_at = NOW()
        """
        execute_values(cursor, insert_centers_query, centers_to_upsert, template="(%s, %s, %s, %s, %s, CURRENT_DATE, NOW())")

        # Commit exactly ONCE for the whole batch
        conn.commit()
        
        # Print exactly ONCE for the whole batch
        print(f"✅ Batch processed: {len(events_to_insert)} events inserted/updated.")

        
        update_daily_stats_batch(cursor, batch)

    except Exception as e:
        print("=" * 80, flush=True)
        print(f"❌ Error processing batch: {e}")
        print("=" * 80, flush=True)
        conn.rollback()



if __name__ == "__main__":
    
    # We establish connection to the database
    # Load .env from the root directory
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST'),
        database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        port=os.getenv('DB_PORT')
    )
    
    fetch_time = get_fetch_times()
    last_fetch_time = get_last_fetch(conn)
    
    print("="*80, flush=True)
    print("Starting batch processing...")
    print("="*80, flush=True)

    # 1. Setup our batching variables
    event_batch = []
    BATCH_SIZE = 5000
    total_processed = 0

    # 2. Accumulate events in memory, don't hit the DB yet!
    for event in fetch_stream_events(last_fetch_time, fetch_time[1]):
        event_batch.append(event)
        total_processed += 1
        
        # 3. Once we hit 5,000 events, trigger the massive bulk insert
        if len(event_batch) >= BATCH_SIZE:
            process_event_batch(event_batch, conn)
            
            # Clear the list so it's empty for the next 5,000
            event_batch.clear() 
            print(f"Progress: {total_processed} total events processed so far...")
    
    # 4. Catch the leftovers! 
    # If you had 163,400 events, this processes that final batch of 3,400
    if event_batch:
        process_event_batch(event_batch, conn)
        print(f"Progress: {total_processed} total events processed so far...")

    # Only do if the fetch process is completed with no errors
    update_last_fetch_date(conn, fetch_time[0])

    conn.close()
    
    print("="*80, flush=True)
    print(f"Procesamiento completado. Grand total: {total_processed} events.")
    print("="*80, flush=True)


















