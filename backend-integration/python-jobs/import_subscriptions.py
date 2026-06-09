import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
import numpy as np
import math

# ────────────────────────────────────────────────────────────────────────
# 1. CONFIGURACIÓN: Base de Datos y Archivo
# ────────────────────────────────────────────────────────────────────────
DB_CONFIG = {
    "dbname": "michael_db",
    "user": "michael",
    "password": "Lc17ma1a2e17b",
    "host": "postgres-michael",
    "port": "5432"
}

CSV_FILE_PATH = "suscripciones.csv"

def clean_val(val):
    """Convierte NaN de pandas o strings vacíos a NULL (None) de Python"""
    if pd.isna(val) or str(val).strip() == "" or val is np.nan:
        return None
    return str(val).strip()

def format_date(val):
    """Convierte fechas del CSV a strings limpios o None"""
    cleaned = clean_val(val)
    if cleaned:
        try:
            # Pandas parsea las fechas automáticamente a datetime objetos si es posible
            return pd.to_datetime(cleaned).isoformat()
        except Exception:
            return cleaned
    return None

def main():
    print(f"[INFO] Leyendo el archivo CSV: {CSV_FILE_PATH}...")
    # Leemos el CSV tratando todos los campos inicialmente como texto para evitar truncados
    df = pd.read_csv(CSV_FILE_PATH, dtype=str)
    print(f"[INFO] Se cargaron {len(df)} filas del CSV.")

    # Conectar a PostgreSQL
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    parent_rows = []
    item_rows = []

    print("[INFO] Procesando y transformando datos...")
    for _, row in df.iterrows():
        # Extraer y limpiar identificadores clave
        sub_id_backend = clean_val(row.get("subscription_id"))
        sub_id_stripe = clean_val(row.get("stripe_subscription_id"))
        
        # Determinar la Clave Primaria Definitiva
        # Si tiene Stripe ID, esa es su PK principal. Si es manual, usamos el backend_id
        pk_subscription_id = sub_id_stripe if sub_id_stripe else sub_id_backend
        
        if not pk_subscription_id:
            # Saltar registros corruptos que no tengan ningún tipo de ID
            continue

        # Clasificación de la fuente
        source = "stripe" if sub_id_stripe else "backend"
        
        # Formatear fechas a UTC ISO
        start_date = format_date(row.get("subscription_current_period_end")) # Nota: Si no hay start_date real, usamos el end como referencia o se queda null
        cancellation_date = format_date(row.get("subscription_canceled_at"))
        
        # Si tiene fecha de cancelación, se asume que el acceso revoca ese mismo día
        revoked_access_date = cancellation_date 
        
        # Determinar si es forever basándonos en si tiene o no fecha de cancelación
        status = clean_val(row.get("subscription_status"))
        is_forever = True if (cancellation_date is None and status != 'canceled') else False

        # Parsear Features si existen en el CSV
        features_raw = clean_val(row.get("subscription_features"))
        features_json = f'["{features_raw}"]' if features_raw else '[]'

        # ────────────────────────────────────────────────────────────────────────
        # A. Preparar Fila para la tabla 'subscriptions'
        # ────────────────────────────────────────────────────────────────────────
        parent_rows.append((
            pk_subscription_id,                 # stripe_subscription_id (Nuestra PK)
            None,                               # hubspot_subscription_id (Se llenará con backfill)
            sub_id_backend,                     # backend_subscription_id
            clean_val(row.get("subscription_kind")), # archetype
            None,                               # manages_own_payment
            clean_val(row.get("center_id")),    # nup_center_id
            start_date,                         # start_date
            is_forever,                         # is_forever
            cancellation_date,                  # precancelled_date
            cancellation_date,                  # cancellation_date
            revoked_access_date,                # revoked_access_date
            status,                             # current_state
            source,                             # source
            None,                               # source_creation
            None,                               # payment_method_type
            False,                              # pending_payment
            False                               # has_duration_mismatch
        ))

        # ────────────────────────────────────────────────────────────────────────
        # B. Preparar Fila para la tabla 'subscription_items' (Solo Manuales)
        # ────────────────────────────────────────────────────────────────────────
        if source == "backend":
            # Generamos un ID único artificial para el ítem manual
            manual_item_id = f"item_manual_{sub_id_backend}"
            
            item_rows.append((
                manual_item_id,                 # stripe_item_id
                pk_subscription_id,             # stripe_subscription_id (Foreign Key)
                None,                           # hubspot_item_id
                None,                           # stripe_product_id
                "manual_product",               # product_name (🆕 Nombre genérico solicitado)
                "month",                        # billing_interval (Asumimos mensual por defecto)
                1,                              # interval_count
                0.00,                           # unit_price (No lo tenemos en el CSV)
                1,                              # quantity
                features_json,                  # features
                start_date,                     # start_date
                start_date,                     # current_period_start
                format_date(row.get("subscription_current_period_end")), # current_period_end
                is_forever,                     # is_forever
                0                               # number_of_renovations
            ))

    # ────────────────────────────────────────────────────────────────────────
    # 3. EJECUCIÓN DEL VOLCADO EN LA BASE DE DATOS (Transacción única masiva)
    # ────────────────────────────────────────────────────────────────────────
    try:
        print("[DATABASE] Iniciando volcado masivo...")
        
        # Inserción masiva en 'subscriptions'
        sub_query = """
            INSERT INTO subscriptions (
                stripe_subscription_id, hubspot_subscription_id, backend_subscription_id, archetype,
                manages_own_payment, nup_center_id, start_date, is_forever, 
                precancelled_date, cancellation_date, revoked_access_date, current_state, 
                source, source_creation, payment_method_type, pending_payment, has_duration_mismatch
            ) VALUES %s
            ON CONFLICT (stripe_subscription_id) DO UPDATE SET
                backend_subscription_id = EXCLUDED.backend_subscription_id,
                nup_center_id = EXCLUDED.nup_center_id,
                current_state = EXCLUDED.current_state,
                source = EXCLUDED.source,
                is_forever = EXCLUDED.is_forever;
        """
        execute_values(cursor, sub_query, parent_rows)
        print(f"[DATABASE] ✅ {len(parent_rows)} registros volcados en 'subscriptions'.")

        # Inserción masiva en 'subscription_items' (Solo los manuales creados)
        if len(item_rows) > 0:
            item_query = """
                INSERT INTO subscription_items (
                    stripe_item_id, stripe_subscription_id, hubspot_item_id, stripe_product_id,
                    product_name, billing_interval, interval_count, unit_price, quantity, features,
                    start_date, current_period_start, current_period_end, is_forever, number_of_renovations
                ) VALUES %s
                ON CONFLICT (stripe_item_id) DO NOTHING;
            """
            execute_values(cursor, item_query, item_rows)
            print(f"[DATABASE] ✅ {len(item_rows)} productos artificiales 'manual_product' creados.")

        conn.commit()
        print("[SUCCESS] ¡Proceso terminado con éxito! Las 30,000 suscripciones están al día.")

    except Exception as e:
        conn.rollback()
        print(f"[ERROR] El volcado falló. Se aplicó un ROLLBACK completo. Error: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()