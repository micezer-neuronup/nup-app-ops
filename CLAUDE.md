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
```bash
DB_HOST=localhost ../venv/bin/python opportunity_detector.py --dry-run   # semanal: imprime el pool y los candidatos, no escribe nada
DB_HOST=localhost ../venv/bin/python opportunity_detector.py             # semanal: escribe en la BD
DB_HOST=localhost ../venv/bin/python daily_usage_detector.py             # diario
```
- Todos los scripts cargan `backend-integration/.env.development` con `load_dotenv`. Las variables que ya existen en el entorno tienen prioridad, y así funcionan en el contenedor.
- La llamada a la Ops API tarda unos 3 minutos (cerca de 385 páginas).
- El venv local está en `backend-integration/scripts/venv` y las dependencias en `scripts/requirements.txt`.

### Docker
`docker compose up -d --build server-michael` (o `dashboard-michael`) desde la raíz.
- Los `.env.*` y `docker-compose*.yml` están en `.gitignore`.
- Las migraciones SQL (`backend-integration/server/db/migrations/`) se aplican a mano con `psql`. No hay un runner de migraciones.

## Arquitectura

### Flujo de datos
1. **Ingesta con cron**: los crons se definen en `server.js` con `node-cron` y lanzan los scripts con `spawn`.

   | Horario | Job |
   |---|---|
   | 06:00 diario | `scripts/amplitude/daily_events.py`: eventos de Amplitude a la tabla `daily_stats`, una fila por centro y día |
   | Lunes 06:00 | `scripts/opportunities/opportunity_detector.py`: detección semanal de oportunidades de Assessment |
   | 07:00 diario | `scripts/opportunities/daily_usage_detector.py`: detecciones diarias, refresco del score y paso a `converted` |
   | Cada 6 h | Sincronización de respaldo con HubSpot (`processPendingHubspotSyncs`), con un flag que impide ejecuciones en paralelo |
   | Cada 4 h | Refresco de la caché de HubSpot |
   | 09/12/16 h | `server/scripts/fullBackfillManual.js`: suscripciones manuales desde la Ops API |

   El cron de Zoho está desactivado.
2. **Suscripciones**:
   - Llegan por el webhook de Stripe `POST /apiwebhooks/stripe`, que usa `express.raw` y verifica la firma. Responde 200 antes de procesar.
   - Las procesan `services/subscriptionServices.js` y `db/dbSubscriptions.js`, y se sincronizan con HubSpot (`services/hubspotServices.js`).
3. **API para el dashboard**:
   - Las consultas viven en `server/db/dbAnalytics.js`.
   - Endpoints de oportunidades:
     - `GET /api/opportunities`: excluye las que están `expired`.
     - `GET /api/opportunities/:id/usage`: tests por día de los últimos 60 días.
     - `PATCH /api/commercial-opportunities/:id`: cambia el estado.
     - `POST /api/commercial-opportunities/:id/assign-upsell`: actualiza la compañía en HubSpot y la BD.
   - Otros endpoints:
     - `GET /api/hubspot/owners`;
     - `GET /api/company-data`: datos para la tarjeta embebida en HubSpot.

### Oportunidades de Assessment (`scripts/opportunities/`)
- **`ops_filter.py`: la Ops API es la única fuente de qué centros tienen cada feature.**
  - Se consulta sin filtro `kind`, porque se quieren todas las suscripciones.
  - Si falla (falta el token, falla una página o se alcanza `MAX_PAGES`), lanza `OpsApiError` y el job se para sin escribir nada. Nunca se usan datos locales como alternativa.
  - `load_center_access` asigna un nivel de acceso a cada centro: `verified`, `cancelling`, `unverified`, `trial` o `none`.
    - **Stripe**: se usa el `current_state` de la tabla `subscriptions`, que es fiable.
    - **Manuales**: se usa el payload de la Ops API. El `status` de la Ops API solo indica el tipo de acceso (`active` o `trial`), nunca si está cancelada. El `current_state` de las suscripciones manuales se deduce de fechas que suelen estar desactualizadas, así que lo que cuenta son `canceledAt` y `currentPeriodEnd`.
  - **La actividad reciente es la prueba de acceso**: un centro sin acceso `verified` solo es oportunidad si ha tenido actividad en los últimos 14 días (`RECENT_ACCESS_DAYS`).
  - **Grupos de `build_scored_pool`**:
    - `assessment`: centros sin test_all. Si son clientes verificados van a Pendientes; si tienen algún `check_reasons`, a Revisar.
    - `expansion`: clientes verificados que ya tienen test_all y están en el top 15 %. Van a la pestaña "Uso alto" y nunca pasan a `converted`.
    - Los centros con solo acceso de prueba (`trial`) quedan fuera.
  - `scripts/opportunities/ops_status_report.py`: informe de solo lectura con los valores que devuelve la Ops API.
- **`scoring.py`**:
  - Constantes: ventana de 60 días, tendencia de 30 frente a 30, mínimo de 10 tests y 3 días activos, prioridad `alta` a partir del percentil 0,85, enfriamiento de 90 días.
  - Score = 50 % volumen (percentil de tests) + 30 % constancia (días activos / 60) + 20 % tendencia.
  - `kind` es `review` si el centro tuvo test_all antes y `upgrade` si no.
- **Estados en `commercial_opportunity`**: `pending`, `completed` (revisada en la UI), `converted` (el centro ya tiene test_all) y `expired` (dejó de ser elegible).
  - Las `completed` dentro del enfriamiento se refrescan pero nunca se expiran.
  - La migración `001_...expired_status.sql` añade `expired`.
- **`trigger_details` (JSON)**: contiene métricas, partes del score, prioridad, `track_reason` y umbrales, y el frontend lo lee directamente.
  - La justificación es una plantilla determinista (`build_justification`).
  - `generate_ai_justification` (OpenRouter) se conserva pero no se llama.
- **Brief de IA (`ai_brief.py`)**: lo genera el job semanal, con OpenRouter y `gpt-4o-mini`.
  - Contenido: `{summary, points[2]}`, guardado en `ai_brief`, `ai_brief_at` y `ai_brief_signature` (migración 002).
  - Datos: solo el scoring y el resto de columnas de `daily_stats`. Nada de HubSpot ni datos de contacto.
  - Se genera **después** del commit principal, y se regenera solo si cambia la firma `kind|priority|trend_dir`. Hay un tope de 50 por ejecución.
  - Si falla, solo deja un aviso y el job sigue.
  - Para revisar el tono sin escribir nada: `--dry-run --brief`.
  - Al asignar, `assignUpsellOpportunity` envía el brief a HubSpot (`upsell_ai_justification`); si no hay brief, envía la plantilla.

### Dashboard (`dashboard/`)
- **Rutas**:
  - `app/[dashboard]/` → `GeneralDashboard`: solo admite `general`. Lee `objectId` y `objectTypeId` de la URL porque se embebe desde HubSpot.
  - `app/opp-dashboard/` → `OppHome`: rejilla de módulos configurada en `components/opp-dashboard/modules.ts`.
  - `app/opp-dashboard/assessment` → `OppDashboard`: lista ordenada con pestañas, `OpportunityList` y `ModalOpp`.
  - `activity`, `sessions` y `licenses` → `ModulePlaceholder`.
  - `app/stock-control/`: va contra otro backend (`NEXT_PUBLIC_STOCK_CONTROL_URL`, por defecto `:5000`), no contra este servidor.
- **Fetching**: todo es del lado del cliente con `NEXT_PUBLIC_SERVER_URL` y la cabecera `ngrok-skip-browser-warning: true`, porque en desarrollo el servidor se expone por ngrok. `next.config.js` tiene `allowedDevOrigins` para el túnel del dashboard.
- **Piezas compartidas del módulo de oportunidades** (`components/opp-dashboard/shared/`):
  - `Tag`: etiqueta neutra; el color del tipo solo aparece al pasar el ratón.
  - `PriorityBadge`/`getTrack`: leen `trigger_details`.
  - `OppHeader`.
  - `UsageChart`.
- **Tailwind v4**: el escáner necesita nombres de clase completos y literales, así que no se pueden construir clases concatenando strings.

## Convenciones del código
- Los bloques de comentarios con el formato `// ────── Título ───` / `# ── ...` son del autor. No se borran ni se reescriben; solo se corrigen si son incorrectos. Los comentarios nuevos siguen el mismo estilo.
- Los textos de la UI y los logs de los jobs están en español. Los comentarios de los jobs están en inglés.
