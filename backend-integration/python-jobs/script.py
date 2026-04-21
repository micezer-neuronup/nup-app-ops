import os
import json
import psycopg2
import time
from datetime import datetime
from zipfile import ZipFile
from pathlib import Path
import requests
from requests.auth import HTTPBasicAuth
from dotenv import load_dotenv
env_path = Path(__file__).resolve().parent.parent /".env.development"
load_dotenv(dotenv_path=env_path)


SIMULATION_MODE = os.getenv('SIMULATION_MODE') == 'True'



AMPLITUDE_API_KEY = os.getenv('AMPLITUDE_API_KEY') 
AMPLITUDE_SECRET_KEY = os.getenv('AMPLITUDE_SECRET_KEY')

print(f"SIMULATION_MODE = {AMPLITUDE_API_KEY}")  # Verifica que sea True
print(f"AMPLITUDE_API_KEY = {AMPLITUDE_API_KEY}")  # Verifica que sea True
print(f"AMPLITUDE_SECRET_KEY = {AMPLITUDE_SECRET_KEY}")  # Verifica que sea True

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
ZIP_PATH = Path(__file__).parent / 'export.zip'


# Pasar last_fetch_time y fetch_time[1]
def fetch_stream_events(last_fetch_time, fetch_time):
    if SIMULATION_MODE:
        print("="*80, flush=True)
        print("SIM: Reading local json file for simulation...")
        print("="*80, flush=True)
    else:
        print("="*80, flush=True)
        print("PROD: Fetching events from Amplitude API...")
        print("="*80, flush=True)

    #auth = HTTPBasicAuth(AMPLITUDE_API_KEY, AMPLITUDE_SECRET_KEY) 
    
    # Use when API available #url = f'https://amplitude.com/api/2/export?start={last_fetch_time}&end={fetch_time}' 
    #response = requests.get(url, auth=auth, stream=True) 
    #with open('export.zip', 'wb') as f: 
    # for chunk in response.iter_content(chunk_size=8192): 
    # f.write(chunk) # Store on disk

    # Abre el zip y procesa los archivos de forma común
    with ZipFile(ZIP_PATH, 'r') as zf:
        for file_name in zf.namelist():
            with zf.open(file_name) as f:
                for line in f:
                    yield json.loads(line.decode('utf-8').strip())
        
        pass





"""
Takes an event in json format and insert it to postgres
Recieves and event and a connection from database
We will extract data base on my schema events

"""


def update_daily_stats(conn, center_id, event_date, event_type):
    cursor = conn.cursor()
    
    col_map = {
        'Exercise - Finished': 'exercises',
        'Session - Finished': 'sessions',
        'Test - Started': 'tests_started',
        'Test - Finished': 'tests_finished',
        'Activity - Started': 'activities_started',
        'User - Login': 'logins'
    }
    
    col = col_map.get(event_type)
    if not col:
        return
    
    cursor.execute(f"""
        INSERT INTO center_daily_stats (center_id, date, {col})
        VALUES (%s, %s, 1)
        ON CONFLICT (center_id, date) DO UPDATE SET
            {col} = center_daily_stats.{col} + 1
    """, (center_id, event_date))
    conn.commit()

def process_event(event, conn):
    try:
        cursor = conn.cursor()

        # Extraer campos del evento
        center_id_raw = event.get('groups', {}).get('center_id')
        if isinstance(center_id_raw, list):
            center_id = center_id_raw[0] if center_id_raw else None
        else:
            center_id = center_id_raw
            
        event_type = event.get('event_type')
        user_id = event.get('user_id')
        patient_id = event.get('event_properties', {}).get('patient_id')
        event_timestamp = event.get('event_time')
        event_id_amplitude = event.get('event_id')
        
        # Convertir timestamp a date para daily_stats
        event_date = event_timestamp[:10] if event_timestamp else None

        # Verificar campos obligatorios
        if event_type and center_id and user_id and event_timestamp:
            cursor.execute("""
                INSERT INTO events (center_id, event_type, user_id, patient_id, event_timestamp, event_id_amplitude, raw_data, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            """, (center_id, event_type, user_id, patient_id, event_timestamp, event_id_amplitude, json.dumps(event)))

            print(f"-------Event was inserted successfully in the database-------")
            
            # 🔴 LLAMAR AQUÍ a update_daily_stats
            update_daily_stats(conn, center_id, event_date, event_type)

        # Actualizar centro
        if center_id:
            col_map = {
                'Exercise - Finished': 'total_exercises',
                'Session - Created': 'total_sessions',
                'Session - Started': 'total_sessions',
                'Session - Finished': 'total_sessions',
                'User - Login': 'total_logins'
            }
            
            col = col_map.get(event_type)
            
            if col:
                cursor.execute(f"""
                    INSERT INTO centers (center_id, total_events, {col}, last_activity_date, updated_at)
                    VALUES (%s, 1, 1, CURRENT_DATE, NOW())
                    ON CONFLICT (center_id) DO UPDATE SET
                        total_events = centers.total_events + 1,
                        {col} = centers.{col} + 1,
                        last_activity_date = CURRENT_DATE,
                        updated_at = NOW()
                """, (center_id,))
            else:
                cursor.execute("""
                    INSERT INTO centers (center_id, total_events, last_activity_date, updated_at)
                    VALUES (%s, 1, CURRENT_DATE, NOW())
                    ON CONFLICT (center_id) DO UPDATE SET
                        total_events = centers.total_events + 1,
                        last_activity_date = CURRENT_DATE,
                        updated_at = NOW()
                """, (center_id,))

            print(f"-------Center with id {center_id} has been inserted or updated in the database-------")

        conn.commit()

    except Exception as e:
        print("=" * 80, flush=True)
        print(f"Error processing event {event.get('event_id', 'unknown')}: {e}")
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

    
    event_counter = 1
    for event in fetch_stream_events(last_fetch_time,fetch_time[1]):
        print("="*80, flush=True)
        print(f"Fetching required fields from json of event nº{event_counter}...")
        print("="*80, flush=True)
        process_event(event,conn)
        event_counter += 1
    
    
    # Only do if the fecth process is completed with no errors
    update_last_fetch_date(conn,fetch_time[0])


    conn.close()
    print("="*80, flush=True)
    print("Procesamiento completado.")
    print("="*80, flush=True,)


















