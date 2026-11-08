# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visión general

Herramientas internas de operaciones de NeuronUP. Hay dos aplicaciones, que se despliegan con `docker-compose.yml` en la raíz:

- **`backend-integration/`**: servidor Express (`server/server.js`, puerto 3001) más jobs en Python (`scripts/`) que el propio servidor lanza por cron. Va en un único contenedor (`backend-integration/dockerfile`: Node 18 con un venv de Python en `/opt/venv`).
- **`dashboard/`**: Next.js 16 (App Router) con Tailwind v4, Radix/shadcn y Recharts. Puerto 3000, build `output: 'standalone'`.
- **Infraestructura**: PostgreSQL 15 (`postgres-michael`) y Redis 7 (`redis-michael`). Todos los servicios están en la red `network-michael`.

`dashboard/AGENTS.md` (lo genera `next dev`) avisa de que esta versión de Next tiene cambios incompatibles. Antes de escribir código de Next, lee la guía correspondiente en `dashboard/node_modules/next/dist/docs/`. Por ejemplo, en `next/image` `priority` está obsoleto y se usa `preload`.

## Comandos

### Dashboard (`cd dashboard`)
```bash
npm run dev          # next dev en :3000
npm run build        # build standalone
npx tsc --noEmit     # comprobación de tipos (la forma fiable de validar cambios)
```
- `npm run lint` / ESLint falla con "Converting circular structure to JSON". Es un problema de configuración que ya existía y no tiene que ver con tus cambios.
- No hay tests automatizados en el repo.

### Servidor (`cd backend-integration/server`)
```bash
NODE_ENV=development node server.js   # carga ../.env.development (NODE_ENV=production carga ../.env.production)
```
- El cliente de Stripe se crea en la primera línea de `server.js`, antes de que dotenv cargue el `.env`. Por eso `STRIPE_SECRET_KEY` tiene que venir del entorno del proceso.
- Para arrancarlo fuera de Docker contra los contenedores locales:
  `STRIPE_SECRET_KEY=... DB_HOST=localhost REDIS_HOST=localhost PORT=3001 node server.js`

### Jobs de Python (`cd backend-integration/scripts/opportunities`)
Un subdirectorio por módulo (`assessment/`, `sessions/`) y el código común en `shared/`. Cada script añade `scripts/opportunities` al `sys.path` para importar `shared.*`.
```bash
DB_HOST=localhost ../venv/bin/python assessment/opportunity_detector.py --dry-run   # semanal: imprime el pool y los candidatos, no escribe nada
DB_HOST=localhost ../venv/bin/python assessment/opportunity_detector.py             # semanal: escribe en la BD
DB_HOST=localhost ../venv/bin/python assessment/daily_usage_detector.py             # diario
DB_HOST=localhost ../venv/bin/python sessions/sessions_detector.py --dry-run        # semanal (Sesiones)
```
- Todos los scripts cargan `backend-integration/.env.development` con `load_dotenv`. Las variables que ya existen en el entorno tienen prioridad, y así funcionan en el contenedor.
- La llamada a la Ops API tarda unos 3 minutos (cerca de 385 páginas).
- El venv local está en `backend-integration/scripts/venv` y las dependencias en `scripts/requirements.txt`.

### Docker
`docker compose up -d --build server-michael` (o `dashboard-michael`) desde la raíz.
- Los `.env.*` y `docker-compose*.yml` están en `.gitignore`.
- Las migraciones SQL (`backend-integration/server/db/migrations/`) se aplican a mano con `psql`. No hay un runner de migraciones. La cabecera de cada una dice si va antes o después del rebuild (p. ej. 004 antes, 005 justo después).

## Arquitectura

### Flujo de datos
1. **Ingesta con cron**: los crons se definen en `server.js` con `node-cron` y lanzan los scripts con `spawn`.

   | Horario | Job |
   |---|---|
   | 06:00 diario | `scripts/amplitude/daily_events.py`: eventos de Amplitude a la tabla `daily_stats`, una fila por centro y día |
   | Lunes 06:00 | `scripts/opportunities/assessment/opportunity_detector.py`: detección semanal de oportunidades de Assessment |
   | Lunes 06:30 | `scripts/opportunities/sessions/sessions_detector.py`: detección semanal de oportunidades de Sesiones |
   | 07:00 diario | `scripts/opportunities/assessment/daily_usage_detector.py`: detecciones diarias, refresco del score y paso a `converted` (solo `product = 'assessments'`) |
   | Cada 6 h | Sincronización de respaldo con HubSpot (`processPendingHubspotSyncs`), con un flag que impide ejecuciones en paralelo |
   | Cada 4 h | Refresco de la caché de HubSpot |
   | 09/12/16 h | `server/scripts/fullBackfillManual.js`: suscripciones manuales desde la Ops API |
   | 03:00 diario | `services/stripeCatchup.js`: reprocesa las suscripciones con eventos de Stripe de las últimas 26 h (el webhook responde 200 antes de procesar y Stripe no reintenta). Manual: `server/scripts/stripeCatchup.js [horas]` |
   | 05:00 diario | `services/centersSync.js`: tabla `centers` desde HubSpot (empresas con `nup_center_id`) + IDs de Stripe/Zoho de la Ops API. Manual: `server/scripts/syncCenters.js` |
   | Domingo 04:00 | `server/scripts/reconcileHubspotStatuses.js --apply`: la BD es la fuente de verdad; las suscripciones de HubSpot que no coinciden (estado, isforever, fechas) y las vivas que faltan pasan a `PENDING`. Sin `--apply` es un dry run |

   El cron de Zoho está desactivado.
2. **Suscripciones**:
   - Llegan por el webhook de Stripe `POST /apiwebhooks/stripe`, que usa `express.raw` y verifica la firma. Responde 200 antes de procesar.
   - Las procesan `services/subscriptionServices.js` y `db/dbSubscriptions.js`, y se sincronizan con HubSpot (`services/hubspotServices.js`).
   - **Mapeo Stripe → filas**: `services/stripeMapping.js` (`mapStripeSubscription`, función pura). Lo usan el webhook y `scripts/fullBackfillStripe.js`; no duplicar la lógica en ninguno de los dos.
     - Fin (`cancelation_date` = `revoked_access_date`): si está `canceled`, `ended_at`; si no, `cancel_at`. El periodo de facturación se lee del item (API de Stripe ≥ 2025-03).
   - **`is_forever` lo calcula Postgres** (columna generada, migración 005): viva (`active`/`past_due`/`trial`) y sin fecha de fin. No se escribe desde el código. `subscription_items` ya no tiene `is_forever`.
   - **Manuales** (`scripts/fullBackfillManual.js`): `start_date` = `createdAt` de la Ops API. Solo reescribe y marca `PENDING` para HubSpot cuando algo cambia. `revoked_access_date` vacío (la Ops API aún no da la fecha de fin real).
   - **Manual → Stripe**: la Ops API cambia el `kind` del mismo registro. `closeMigratedManualSubs` rellena `migrated_to_subscription_id` (la de Stripe, que lleva el id manual en `backend_subscription_id`) y cierra la manual si seguía viva.
   - `hubspot_subscription_id` / `hubspot_item_id`: record ID de HubSpot, guardado por `saveHubspotIds` tras el sync.
   - Campos de facturas y dinero (`pending_payment`, `last_invoice_*`, `number_of_renovations`, `unit_price`) vendrán de Zoho; no se tocan hasta entonces.
   - **`centers`** (migración 006): una fila por centro. El universo son las empresas de HubSpot con `nup_center_id` numérico (no todas tienen suscripción).
     - De HubSpot: `hubspot_company_id` (la empresa que TIENE el `nup_center_id`), `name`, `commercial_name`, `segment` (se va rellenando; null si vacío), `market`, `currency` (mayúsculas).
     - De la Ops API: `stripe_customer_id`, `zoho_contact_id`. Su `hubspotCompanyId` no se usa: tras un merge en HubSpot guarda el id de la empresa que desapareció.
     - El sync de HubSpot (`findCompanyHubspotId`) lee la empresa de `centers`; la búsqueda por `nup_center_id` queda como respaldo.
     - `subscriptions` ya no guarda datos del centro (`center_name`, `segment`, `market`; migración 007): quien los necesite hace JOIN con `centers` (`COALESCE(name, commercial_name)`).
3. **API para el dashboard**:
   - Las consultas viven en `server/db/dbAnalytics.js`.
   - Endpoints de oportunidades:
     - `GET /api/opportunities?product=assessments|sessions`: excluye las que están `expired`. Cada módulo del dashboard pide solo su producto.
     - `GET /api/opportunities/:id/usage`: uso por día de los últimos 60 días con la métrica del módulo (`tests_finished` o `sessions_finished`).
     - `PATCH /api/commercial-opportunities/:id`: cambia el estado.
     - `POST /api/commercial-opportunities/:id/assign-upsell`: actualiza la compañía en HubSpot y la BD.
   - Otros endpoints:
     - `GET /api/hubspot/owners`;
     - `GET /api/company-data`: datos para la tarjeta embebida en HubSpot.

### Oportunidades (`scripts/opportunities/`)
- **`shared/`**: `ops_filter.py` (acceso), `scoring.py` (score genérico por métrica: `fetch_usage(cursor, metric)`, `compute_usage_score`, motivos de acceso), `ai_brief.py` (llamada a OpenRouter, validación, contexto de uso, `write_briefs`) y `ops_status_report.py`.
- **`assessment/`**: `opportunity_detector.py`, `daily_usage_detector.py`, `pool.py` (clasificación) y `brief.py` (prompt).
- **`sessions/`**: `sessions_detector.py`, `pool.py` y `brief.py`. Ver abajo.
- Las columnas `*_tests_60d` de `commercial_opportunity` guardan la métrica del módulo (tests o sesiones finalizadas).
- **`shared/ops_filter.py`: la Ops API es la única fuente de qué centros tienen cada feature.**
  - Se consulta sin filtro `kind`, porque se quieren todas las suscripciones.
  - Si falla (falta el token, falla una página o se alcanza `MAX_PAGES`), lanza `OpsApiError` y el job se para sin escribir nada. Nunca se usan datos locales como alternativa.
  - `load_center_access` asigna un nivel de acceso a cada centro: `verified`, `cancelling`, `unverified`, `trial` o `none`.
    - **Stripe**: se usa el `current_state` de la tabla `subscriptions`, que es fiable.
    - **Manuales**: se usa el payload de la Ops API. El `status` de la Ops API solo indica el tipo de acceso (`active` o `trial`), nunca si está cancelada. El `current_state` de las suscripciones manuales se deduce de fechas que suelen estar desactualizadas, así que lo que cuenta son `canceledAt` y `currentPeriodEnd`.
  - **El uso es la prueba de acceso**: cualquier centro que supere el mínimo de tests en 60 días entra, tenga o no suscripción. El nivel de acceso solo decide qué hay que revisar. No se exige actividad reciente: los tests no se usan a diario.
  - **Grupos de `build_scored_pool`**:
    - `assessment`: centros sin test_all. Si son clientes verificados van a Pendientes; si tienen algún `check_reasons`, a Revisar.
    - `expansion`: clientes verificados que ya tienen test_all y están en el top 15 %. Van a la pestaña "Uso alto" y nunca pasan a `converted`.
    - Los centros con solo acceso de prueba (`trial`) quedan fuera.
  - `scripts/opportunities/shared/ops_status_report.py`: informe de solo lectura con los valores que devuelve la Ops API.
- **`shared/scoring.py`** (y `assessment/pool.py` para las reglas de Assessment):
  - Constantes: ventana de 60 días, tendencia de 30 frente a 30, mínimo de 10 tests y 3 días activos, prioridad `alta` a partir del percentil 0,85, enfriamiento de 90 días.
  - Score = 50 % volumen (percentil de tests) + 30 % constancia (días activos / 60) + 20 % tendencia.
  - `kind` es `review` si el centro tuvo test_all antes y `upgrade` si no.
- **Estados en `commercial_opportunity`**: `pending`, `completed` (revisada en la UI), `converted` (el centro ya tiene test_all) y `expired` (dejó de ser elegible).
  - Las `completed` dentro del enfriamiento se refrescan pero nunca se expiran.
  - La migración `001_...expired_status.sql` añade `expired`.
- **`trigger_details` (JSON)**: contiene métricas, partes del score, prioridad, `track_reason` y umbrales, y el frontend lo lee directamente.
  - La justificación es una plantilla determinista (`build_justification`).
  - `generate_ai_justification` (OpenRouter) se conserva pero no se llama.
- **Brief de IA (`shared/ai_brief.py` + `<modulo>/brief.py`)**: lo genera el job semanal, con OpenRouter y `gpt-4o-mini`.
  - Contenido: `{summary, points[2]}`, guardado en `ai_brief`, `ai_brief_at` y `ai_brief_signature` (migración 002).
  - Datos: solo el scoring y el resto de columnas de `daily_stats`. Nada de HubSpot ni datos de contacto.
  - Se genera **después** del commit principal, y se regenera solo si cambia la firma `kind|priority|trend_dir|check_reasons`. Hay un tope de 50 por ejecución.
  - Las sesiones van al prompt por separado (iniciadas, finalizadas), nunca sumadas. Las asignadas no se envían: el modelo acababa sugiriendo "asignar más sesiones". `sessions_created` siempre es 0 porque `Session - Created` está en `IGNORED_EVENTS`.
  - Si falla, solo deja un aviso y el job sigue.
  - Para revisar el tono sin escribir nada: `--dry-run --brief`.
  - Al asignar, `assignUpsellOpportunity` envía el brief a HubSpot (`upsell_ai_justification`); si no hay brief, envía la plantilla.

### Oportunidades de Sesiones (`scripts/opportunities/sessions/`)
- Todos los centros tienen sesiones: no hay feature que detectar. La métrica es `sessions_finished`; `sessions_assigned` no clasifica (muchos centros inician sin asignar).
- Un `opportunity_kind` por centro, el primero que aplique: `access_review` (sin acceso verificado y con uso al menos en el percentil 50 de los clientes, a Revisar) > `churn` (≥ 40 finalizadas el mes anterior y caída ≥ 60 %) > `adoption` (≥ 40 iniciadas y finalización ≤ 15 %) > `high_use` (clientes verificados en el top 3 %). Trials fuera.
- Mínimo de uso propio del módulo: 30 sesiones finalizadas en ≥ 8 días (no el compartido de 10 en 3). Los umbrales están en `sessions/pool.py` y se repiten en los textos de `dashboard/.../sessions/config.ts` (constante `T`): si cambian, cambiar los dos.
- `sessions_detector.py --dry-run --calibrate` imprime cuántos centros saldrían en cada pestaña con otros valores de cada umbral, para ajustarlos con los datos reales.
- El tipo de una oportunidad abierta puede cambiar de una semana a otra; el job la refresca con el nuevo tipo.
- `daily_stats` tiene `sessions_home_started`, `sessions_home_finished` (`event_properties.home`) y `session_patients` (pacientes distintos por día, se usa como media por día activo). Migración 003. `events` se purga cada pocos meses, así que lo que se quiera conservar va a `daily_stats`.
- `scripts/amplitude/backfill.py` (fechas fijas en el código) vuelve a descargar eventos de Amplitude y recalcula `daily_stats` de cada día con `aggregate_daily_stats` de `daily_events.py`. Solo el paso 1: las feature requests no son idempotentes.

### Dashboard (`dashboard/`)
- **Rutas**:
  - `app/[dashboard]/` → `GeneralDashboard`: solo admite `general`. Lee `objectId` y `objectTypeId` de la URL porque se embebe desde HubSpot.
  - `app/opp-dashboard/` → `OppHome`: rejilla de módulos configurada en `components/opp-dashboard/modules.ts`.
  - `app/opp-dashboard/assessment` y `app/opp-dashboard/sessions` → `shared/OppBoard` con la config del módulo (`assessment/config.ts`, `sessions/config.ts`): producto, métrica, pestañas con su filtro, motivos, etiquetas y ayuda.
  - `activity` y `licenses` → `ModulePlaceholder`.
  - `app/stock-control/`: va contra otro backend (`NEXT_PUBLIC_STOCK_CONTROL_URL`, por defecto `:5000`), no contra este servidor.
- **Fetching**: todo es del lado del cliente con `NEXT_PUBLIC_SERVER_URL` y la cabecera `ngrok-skip-browser-warning: true`, porque en desarrollo el servidor se expone por ngrok. `next.config.js` tiene `allowedDevOrigins` para el túnel del dashboard.
- **Piezas compartidas del módulo de oportunidades** (`components/opp-dashboard/shared/`): `OppBoard`, `OpportunityList`, `ModalOpp`, `AssignUpsellModal`, `types.ts`, `moduleConfig.ts` y además:
  - `Tag`: etiqueta neutra; el color del tipo solo aparece al pasar el ratón.
  - `PriorityBadge`/`getTrack`: leen `trigger_details`.
  - `OppHeader`.
  - `UsageChart`.
- **Tailwind v4**: el escáner necesita nombres de clase completos y literales, así que no se pueden construir clases concatenando strings.

## Convenciones del código
- Los bloques de comentarios con el formato `// ────── Título ───` / `# ── ...` son del autor. No se borran ni se reescriben; solo se corrigen si son incorrectos. Los comentarios nuevos siguen el mismo estilo.
- Los textos de la UI y los logs de los jobs están en español. Los comentarios de los jobs están en inglés.
