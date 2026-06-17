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
HUBSPOT_TOKEN = os.getenv('HUBSPOT_TOKEN') # ¡Añade tu token al .env!

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


def sync_hubspot_metrics(cursor, end_str):
    print(f"[INFO] [HUBSPOT] Calculating Health Scores & Syncing | ref_date={end_str}", flush=True)
    
    # La fecha de referencia es el final del día que estamos procesando
    ref_date = datetime.strptime(end_str, "%Y%m%dT%H").date()
    start_30d = ref_date - timedelta(days=30)
    
    # 1. Recuperamos métricas de los últimos 30 días (Ignoramos asignadas, usamos started y finished)
    


    # Consulta optimizada con filtro de estado
    cursor.execute("""
    SELECT 
        ds.center_id,  -- Mantenemos ds.center_id para que el resto del bucle for no rompa
        COUNT(DISTINCT CASE WHEN ds.total_logins > 0 THEN ds.stat_date END) as active_days,
        SUM(ds.sessions_started) as sum_started,
        SUM(ds.sessions_finished) as sum_finished,
        MAX(ds.stat_date) FILTER (WHERE ds.total_logins > 0) as last_login_date
    FROM daily_stats ds
    JOIN subscriptions s ON ds.center_id = s.nup_center_id  -- Unido por nup_center_id
    WHERE ds.stat_date > %s AND ds.stat_date <= %s
      AND s.current_state IN ('active', 'trial', 'past_due')
    GROUP BY ds.center_id;  -- Agrupamos por la misma columna del SELECT
""", (start_30d, ref_date))
    
    stats_rows = cursor.fetchall()

    # 2. Mapeo de Feature Requests PENDIENTES totales (Para el check booleano)
    cursor.execute("""
        SELECT center_id, COUNT(*) 
        FROM feature_requests 
        WHERE status = 'pending' 
        GROUP BY center_id;
    """)
    pending_features_map = {row[0]: (row[1] > 0) for row in cursor.fetchall()}

    # 3. Mapeo de Feature Requests NUEVAS de las últimas 24h (Para disparar la alerta limpia)
    ref_date_start_ts = (ref_date - timedelta(days=1)).strftime("%Y-%m-%d 00:00:00")
    ref_date_end_ts = ref_date.strftime("%Y-%m-%d 00:00:00")
    
    cursor.execute("""
        SELECT center_id, feature_name 
        FROM feature_requests 
        WHERE requested_at >= %s AND requested_at < %s AND status = 'pending';
    """, (ref_date_start_ts, ref_date_end_ts))
    
    new_features_map = {row[0]: row[1] for row in cursor.fetchall()}

    # --- CONFIGURACIÓN API HUBSPOT ---
    headers = {
        "Authorization": f"Bearer {HUBSPOT_TOKEN}",
        "Content-Type": "application/json"
    }

    success_count = 0
    not_found_count = 0

    # --- BUCLE DE PROCESAMIENTO POR CENTRO ---
    for row in stats_rows:
        center_id, active_days, sum_started, sum_finished, last_login = row
        
        # Paracaídas para valores nulos de la BD
        active_days = active_days or 0
        sum_started = sum_started or 0
        sum_finished = sum_finished or 0

        # =========================================================
        # 🟢 CÁLCULO DEL HEALTH SCORE (MODELO 50/50)
        # =========================================================
        
        # Pilar 1: Frecuencia (Max 50 pts) -> Objetivo: 15 días activos al mes
        freq_score = min(50, (active_days / 10.0) * 50)
        
        # Pilar 2: Adopción (Max 50 pts) -> Objetivo: Terminar el 80% (0.8) de lo empezado
        if sum_started > 0:
            completion_rate = sum_finished / sum_started
            adopt_score = min(50, (completion_rate / 0.8) * 50)
        else:
            adopt_score = 0
            
        # Puntuación final integrada
        health_score = round(freq_score + adopt_score)

        # =========================================================
        # 🔴 CÁLCULO DEL RIESGO DE CHURN (CON FILTRO DE HÁBITO)
        # =========================================================
        days_since_last_login = (ref_date - last_login).days if last_login else 999        

        # Condición de hábito mínima: haber entrado al menos 5 días distintos en el mes
        tiene_habito_real = active_days >= 5

        # 1. Filtro de seguridad: Si no llega al hábito mínimo, es un caso "zombie" (Riesgo Bajo)
        if not tiene_habito_real:
            churn_risk = "bajo"

        # 2. Riesgo Alto: Tiene hábito, pero lleva >= 14 días sin entrar O su salud es crítica (< 30)
        elif days_since_last_login >= 14 or health_score < 30:
            churn_risk = "alto" 
            
        # 3. Riesgo Medio: Tiene hábito, pero su salud flojea (< 40) O sufre frustración activa
        elif health_score < 40 or (sum_started > 5 and sum_finished == 0):
            churn_risk = "medio"
            
        # 4. Riesgo Bajo: Centros con buen hábito y buena salud
        else:
            churn_risk = "bajo"

        # =========================================================
        # 🔵 ASIGNACIÓN DE FEATURES (HISTÓRICO VS NUEVA)
        # =========================================================
        has_pending = pending_features_map.get(center_id, False)
        latest_feature = new_features_map.get(center_id, "") # Vacío si no hay nada hoy

        # =========================================================
        # 🚀 ENVÍO DIRECTO A LA API DE HUBSPOT
        # =========================================================
        url = f"https://api.hubapi.com/crm/v3/objects/companies/{center_id}?idProperty=nup_center_id"
        
        payload = {
            "properties": {
                "health_score": str(health_score),
                "churn_risk": churn_risk,
                "pending_feature": str(has_pending).lower(),
                "latest_requested_feature": latest_feature
            }
        }

        try:
            response = requests.patch(url, headers=headers, json=payload)
            
            if response.status_code == 200:
                success_count += 1
            elif response.status_code == 404:
                # El centro existe en tu BD pero no está creado en HubSpot todavía
                not_found_count += 1
            else:
                print(f"[WARN] HubSpot API Error para center_id {center_id}: {response.status_code} - {response.text}")
        except Exception as api_err:
            print(f"[ERROR] Fallo de red al conectar con HubSpot para center_id {center_id}: {api_err}")

    print(f"[INFO] [HUBSPOT] Sync completed | Updated={success_count} | Not in CRM={not_found_count}\n", flush=True)


if __name__ == "__main__":
    conn = psycopg2.connect(
        host=os.getenv('DB_HOST'), database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'), password=os.getenv('DB_PASSWORD'),
        port=os.getenv('DB_PORT')
    )
    

    start_str, end_str = get_time_window(conn)
    

    start_str = "20260616T00"
    end_str = "20260617T00"
    
    if not start_str:
        print("[INFO] [AMPLITUDE] No new data ready yet. Exiting gracefully.")
        conn.close()
        exit(0)

    print(f"[INFO] [AMPLITUDE] Starting daily run | range={start_str} → {end_str}")

    try:
        cursor = conn.cursor()
        
        # === 🚫 COMENTAMOS TODO LO DE AMPLITUDE PARA ESTE TEST ===
        event_batch = []
        BATCH_SIZE = 5000
        total_processed = 0

        for event in fetch_stream_events(start_str, end_str):
             event_batch.append(event)
             total_processed += 1
        #     
             if len(event_batch) >= BATCH_SIZE:
                 process_event_batch(event_batch, cursor)
                 event_batch.clear()
        # 
        if event_batch:
             process_event_batch(event_batch, cursor)

        conn.commit()

        if total_processed > 0:
             run_daily_aggregations(cursor, start_str, end_str)
        # ========================================================


        # === 🚀 EJECUTAMOS DIRECTAMENTE LA LLAMADA A HUBSPOT ===
        # Le pasamos "20260616T00" para que use el día de hoy como fecha de referencia
        # y calcule los últimos 30 días hacia atrás en la base de datos.
        sync_hubspot_metrics(cursor, start_str)


        # === 🚫 COMENTAMOS EL MARCAPÁGINAS PARA QUE NO SE MUEVA ===
        update_last_fetch_date(conn, end_str) 
        
        conn.commit()
        print("[INFO] [HUBSPOT] Manual test run completed successfully!")

    except Exception as e:
        print(f"[ERROR] [AMPLITUDE] Critical error | error={e}")
        conn.rollback()
    finally:
        conn.close()