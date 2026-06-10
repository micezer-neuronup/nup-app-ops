#  //=================//
# // BACKFILL SCRIPT //
#//=================//

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

env_path = Path(__file__).resolve().parent.parent / ".env.development"
load_dotenv(dotenv_path=env_path)

AMPLITUDE_API_KEY = os.getenv('AMPLITUDE_API_KEY') 
AMPLITUDE_SECRET_KEY = os.getenv('AMPLITUDE_SECRET_KEY')

IGNORED_EVENTS = {
    'Exercise - Finished',
    'Start Session',
    'End Session',
    'Search - Input',
    'Page Viewed',
    'Resource - Opened',
    'Activity Preview - Opened',
    'Activity Solution - Opened',
    'Activity Documentation - Opened'
    'Solution - Downloaded'
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
    'Solution - Downloaded',
    'Session - Generated',
    'Configuration - Created',
    'session_end',
    'session_start',
    'Session - Duplicated',
    'Patient - Created',
    '[Amplitude] Page Viewed',
    'Session - Rated',
    'Activity - Rated',
    'Activity Documentation - Opened',
    'Session - Created'








}

def fetch_stream_events(start_str, end_str):
    print("="*80, flush=True)
    print(f"☁️ Fetching Amplitude API: {start_str} to {end_str}...")
    
    url = f'https://analytics.eu.amplitude.com/api/2/export?start={start_str}&end={end_str}' 
    auth = HTTPBasicAuth(AMPLITUDE_API_KEY, AMPLITUDE_SECRET_KEY) 
    
    response = requests.get(url, auth=auth, stream=True) 
    
    if response.status_code == 404:
        print("⚠️ No data found for this day. Skipping...")
        return
        
    response.raise_for_status() 
    
    zip_path = 'backfill_export.zip'
    
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


if __name__ == "__main__":
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST'), database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'), password=os.getenv('DB_PASSWORD'),
        port=os.getenv('DB_PORT')
    )
    
    print("="*80)
    print("🚀 Starting 1-Year Historical Backfill V2...")
    print("="*80)

    BATCH_SIZE = 5000
    grand_total_processed = 0
    

    current_date = datetime(2025, 10, 1)
    end_date = datetime(2026, 6, 9)

    while current_date < end_date:
        next_date = current_date + timedelta(days=1)
        
        start_str = current_date.strftime("%Y%m%dT%H")
        end_str = next_date.strftime("%Y%m%dT%H")
        
        event_batch = []
        day_total = 0
        cursor = conn.cursor()

        try:
            for event in fetch_stream_events(start_str, end_str):
                event_batch.append(event)
                
                if len(event_batch) >= BATCH_SIZE:
                    process_event_batch(event_batch, cursor)
                    day_total += len(event_batch)
                    grand_total_processed += len(event_batch)
                    event_batch.clear()
            
            if event_batch:
                process_event_batch(event_batch, cursor)
                day_total += len(event_batch)
                grand_total_processed += len(event_batch)
                
            conn.commit()
            print(f"✅ Finished Day {start_str[:8]}: {day_total} valuable events saved.")
            
        except Exception as e:
            print(f"❌ Error on day {start_str}: {e}")
            conn.rollback()
            break

        current_date = next_date

    conn.close()
    print("="*80)
    print(f"🎉 Backfill V2 Complete! Grand total inserted: {grand_total_processed} events.")
    print("="*80)