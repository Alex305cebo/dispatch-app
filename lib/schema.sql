-- The CHECKs below mirror calcLoad's throw conditions exactly (lib/profit.ts).
-- Point: every row in `loads` is a valid calcLoad input by construction, so the
-- load page never has to handle a throw. The DB is the validation, not app code.

CREATE TABLE IF NOT EXISTS trucks (
  id                        SERIAL PRIMARY KEY,
  company_id                TEXT NOT NULL DEFAULT 'default',
  name                      TEXT NOT NULL,
  mpg                       DOUBLE PRECISION NOT NULL CHECK (mpg > 0),
  fuel_price_per_gallon     DOUBLE PRECISION NOT NULL,
  driver_pay_mode           TEXT NOT NULL CHECK (driver_pay_mode IN ('cpm','percent')),
  driver_cents_per_mile     DOUBLE PRECISION,
  driver_percent_of_gross   DOUBLE PRECISION,
  fixed_cost_per_day        DOUBLE PRECISION NOT NULL,
  maintenance_cost_per_mile DOUBLE PRECISION NOT NULL,
  factoring_percent         DOUBLE PRECISION NOT NULL,
  dispatch_percent          DOUBLE PRECISION NOT NULL,
  -- the DriverPay discriminated union, enforced in the DB
  CHECK (driver_pay_mode = 'cpm'     AND driver_cents_per_mile   IS NOT NULL
      OR driver_pay_mode = 'percent' AND driver_percent_of_gross IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS loads (
  id             SERIAL PRIMARY KEY,
  company_id     TEXT NOT NULL DEFAULT 'default',
  truck_id       INTEGER REFERENCES trucks(id),
  status         TEXT NOT NULL DEFAULT 'quoted'
                 CHECK (status IN ('quoted','booked','in_transit','delivered','paid','cancelled')),

  rate           DOUBLE PRECISION NOT NULL CHECK (rate >= 0),
  loaded_miles   DOUBLE PRECISION NOT NULL CHECK (loaded_miles > 0),
  deadhead_miles DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (deadhead_miles >= 0),
  transit_days   DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (transit_days > 0),

  origin         TEXT,
  destination    TEXT,
  truck_location TEXT,               -- DAT's Origin search field: where the truck sits
  spot_rpm       DOUBLE PRECISION,   -- DAT's market rate — the "below market?" answer
  broker_mc      TEXT,
  broker_email   TEXT,
  broker_phone   TEXT,
  reference_id   TEXT,
  pickup_date    DATE,

  source         TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','qr')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Strict per-truck separation: each truck has its own number and driver, and every
-- load, dollar, and analysis is scoped to one truck via loads.truck_id.
-- ADD COLUMN IF NOT EXISTS keeps this idempotent on an already-created DB — no
-- migration ladder until a shipped column actually needs altering.
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS number      TEXT;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS driver_name TEXT;
-- Split "Постоянные расходы" into what it's actually made of, each independently
-- editable and shown as its own line, instead of one lumped number. Defaults are
-- 2026 US owner-operator market rates (researched, not guessed):
--   truck payment  ~$1,200-2,400/mo for a used Class 8   -> $60/day
--   insurance      ~$900-1,600/mo, own authority          -> $40/day
--   ELD+permits    ELD $20-45/mo + IRP/IFTA $185-300/mo   -> $8/day
-- fixed_cost_per_day is retired (superseded by the three columns below) but kept in
-- the table rather than dropped — nothing reads it anymore, dropping it risks nothing
-- but also gains nothing on a local dev DB.
ALTER TABLE trucks ALTER COLUMN fixed_cost_per_day SET DEFAULT 0;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS truck_payment_per_day DOUBLE PRECISION NOT NULL DEFAULT 60;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS insurance_per_day     DOUBLE PRECISION NOT NULL DEFAULT 40;
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS eld_permits_per_day   DOUBLE PRECISION NOT NULL DEFAULT 8;
UPDATE trucks SET number = COALESCE(number, name) WHERE number IS NULL;

CREATE INDEX IF NOT EXISTS loads_status ON loads(status);
CREATE INDEX IF NOT EXISTS loads_created ON loads(created_at DESC);
CREATE INDEX IF NOT EXISTS loads_truck ON loads(truck_id);

-- Generic key-value settings (Telegram session string, api id/hash…). Server-only.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Login audit: the PIN is shared, so "who" is a name the person types (remembered
-- per device) while device + IP + time come from the request. Answers "кто заходил".
CREATE TABLE IF NOT EXISTS logins (
  id          BIGSERIAL PRIMARY KEY,
  who         TEXT,
  ip          TEXT,
  user_agent  TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Geolocated city of the login IP ("Откуда" in the Журнал). Best-effort, filled at
-- sign-in — localhost/private IPs stay NULL.
ALTER TABLE logins ADD COLUMN IF NOT EXISTS city TEXT;

-- Action audit: who did a sensitive thing (deleting a document), kept for the
-- Журнал. The PIN is shared, so "who" is a name typed at the moment of the action —
-- from_loc/to_loc carry the deleted rate con's load route for the "откуда/куда"
-- columns. Nothing is cascade-deleted here — it outlives the document it describes.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  who         TEXT,
  action      TEXT NOT NULL,          -- 'delete_document'
  target      TEXT,                   -- document title
  doc_kind    TEXT,                   -- 'ratecon' | 'bol' | …
  from_loc    TEXT,                   -- load origin
  to_loc      TEXT,                   -- load destination
  ip          TEXT,
  user_agent  TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at DESC);
-- Geolocated city of the actor's IP ("Откуда" in the Журнал), same as logins.city.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS city TEXT;

-- Real per-person accounts, replacing the one shared APP_PIN. admin manages users
-- and company settings — dispatcher has the same full working access everyone had before.
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'dispatcher' CHECK (role IN ('admin', 'dispatcher')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at   TIMESTAMPTZ
);

-- A row per signed-in device. Deleting a row logs that device out immediately —
-- the point of a real session table over a signed cookie: an admin can actually
-- revoke access (disable a user, or one day add a "log out everywhere" button).
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires_at);

-- Live fleet status from ZigZag ELD, keyed by unit number (matches trucks.number).
-- Filled by the ELD API poller (lib/eld.ts via /api/eld-poll) once the vendor key
-- arrives. One row per truck, upserted — this is the newest snapshot, not history.
CREATE TABLE IF NOT EXISTS fleet_status (
  unit         TEXT PRIMARY KEY,
  driver_name  TEXT,
  hos_percent  DOUBLE PRECISION,
  drive_status TEXT,
  location     TEXT,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  eld_seen     TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fleet_status ADD COLUMN IF NOT EXISTS odometer DOUBLE PRECISION;

-- Fuel level, from the vendor's Trips/Last point stream (VehicleStatuses does not
-- carry it). The app has only ever ESTIMATED fuel burn from a fixed mpg in the truck's
-- settings, so this is the first real reading and makes actual-vs-expected possible.
ALTER TABLE fleet_status ADD COLUMN IF NOT EXISTS fuel DOUBLE PRECISION;
-- Heading straight from the device. lib/eld.ts can infer one from two breadcrumbs, but
-- that needs the truck to have moved far enough between polls and is blind while it
-- creeps around a yard. The device knows regardless. Inferred value stays as fallback.
ALTER TABLE fleet_status ADD COLUMN IF NOT EXISTS bearing DOUBLE PRECISION;

-- Append-only GPS breadcrumb, written on every poll — fleet_status only keeps the
-- latest point, this is what lets us tell "parked" from "hasn't moved in 4 hours".
-- ponytail: 7-day retention pruned on write (see lib/eld.ts) — plenty for idle
-- detection, small enough to never need a real job.
CREATE TABLE IF NOT EXISTS truck_position_log (
  id           SERIAL PRIMARY KEY,
  unit         TEXT NOT NULL,
  lat          DOUBLE PRECISION NOT NULL,
  lng          DOUBLE PRECISION NOT NULL,
  drive_status TEXT,
  location     TEXT,
  at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS position_log_unit_at ON truck_position_log(unit, at DESC);

-- Truck passport + maintenance. Everything the owner tracks per truck beyond load
-- economics: repairs done, things to fix, and the oil-change countdown driven by
-- the ELD odometer.
CREATE TABLE IF NOT EXISTS truck_meta (
  truck_id           INTEGER PRIMARY KEY REFERENCES trucks(id),
  vin                TEXT,
  plate              TEXT,
  year               INTEGER,
  make               TEXT,
  model              TEXT,
  oil_interval_mi    DOUBLE PRECISION NOT NULL DEFAULT 25000,
  oil_last_odometer  DOUBLE PRECISION,
  driver_phone       TEXT,
  notes              TEXT,
  driver_photo       BYTEA,
  driver_photo_mime  TEXT
);

CREATE TABLE IF NOT EXISTS truck_maintenance (
  id         SERIAL PRIMARY KEY,
  truck_id   INTEGER NOT NULL REFERENCES trucks(id),
  kind       TEXT NOT NULL CHECK (kind IN ('repair','service','inspection')),
  title      TEXT NOT NULL,
  notes      TEXT,
  cost       DOUBLE PRECISION,
  odometer   DOUBLE PRECISION,
  done_at    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS maint_truck ON truck_maintenance(truck_id, done_at DESC);

-- Documents (rate cons, BOL/POD, insurance, registration…), attached to a truck
-- OR a load, or neither (company-wide). Files live as bytea right in Neon — free,
-- works locally and on Vercel alike.
-- ponytail: bytea has a ceiling (Neon free 0.5GB) — move to Vercel Blob when photos
-- start piling up. The API stays the same, only storage moves.
CREATE TABLE IF NOT EXISTS documents (
  id          SERIAL PRIMARY KEY,
  truck_id    INTEGER REFERENCES trucks(id),
  load_id     INTEGER REFERENCES loads(id),
  kind        TEXT NOT NULL DEFAULT 'other'
              CHECK (kind IN ('ratecon','bol','pod','insurance','registration','other')),
  title       TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  data        BYTEA NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS docs_truck ON documents(truck_id);
CREATE INDEX IF NOT EXISTS docs_load ON documents(load_id);

CREATE TABLE IF NOT EXISTS truck_todos (
  id         SERIAL PRIMARY KEY,
  truck_id   INTEGER NOT NULL REFERENCES trucks(id),
  title      TEXT NOT NULL,
  notes      TEXT,
  priority   TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','urgent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS todos_truck ON truck_todos(truck_id, done_at NULLS FIRST, created_at DESC);

-- Заглушка, чтобы на пустой базе было к чему привязать первый груз: без единого
-- трака defaultTruck() бросает исключение (lib/loads.ts).
--
-- Названа явной заглушкой НАРОЧНО. Раньше строка называлась «Truck 1» и несла
-- реальную экономику одного конкретного парка: 60¢/милю водителю, $60/день за
-- трак, факторинг 2%, 6.5 mpg. В чужой установке это чужие цифры, которые
-- выглядят авторитетно: новый владелец открывает прибыль по первому же грузу,
-- видит «чистыми $1,477» и не догадывается, что расчёт идёт по чьим-то ставкам.
--
-- Поэтому: имя говорит, что трак не настроен, а все ставки по нулям. Нули
-- безопаснее чужих цифр, но сами по себе тоже врут — только в другую сторону:
-- при нулевых расходах «чистыми» равно ставке целиком. Поэтому в разборе груза
-- стоит проверка (components/analysis.tsx): пока себестоимость нулевая, вместо
-- красивой цифры выводится предупреждение. Одно без другого не работает.
--
-- Исключение — mpg: расход не может быть нулём, calcLoad делит на него и
-- бросает исключение. Там 6.5 — общеизвестное среднее для Class 8, а не чья-то
-- настройка.
INSERT INTO trucks (id, name, number, driver_name, mpg, fuel_price_per_gallon,
                    driver_pay_mode, driver_cents_per_mile,
                    truck_payment_per_day, insurance_per_day, eld_permits_per_day,
                    maintenance_cost_per_mile, factoring_percent, dispatch_percent)
VALUES (1, 'Трак не настроен', '1', '', 6.5, 0, 'cpm', 0, 0, 0, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- ===== Roadmap features (invoicing/AR, compliance dates, broker vetting) =====

-- Compliance expiry dates on the truck passport (registration/inspection/insurance)
-- and its driver (CDL/medical). Idempotent adds so re-running is safe.
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS registration_expiry DATE;
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS inspection_expiry   DATE;
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS insurance_expiry    DATE;
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS cdl_expiry          DATE;
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS medcard_expiry      DATE;
-- Wherever the truck number is shown, the trailer number belongs right next to it.
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS trailer_number       TEXT;

-- Invoicing + AR aging live on the load itself (one invoice per load for a small
-- fleet). invoiced_at set when the packet is generated, paid_at when broker pays.
-- Broker special instructions parsed off the rate con — the "must read" block on a
-- load. notes_read_at NULL = not yet acknowledged (shown highlighted).
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_notes  TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS notes_read_at TIMESTAMPTZ;
-- Broker/logistics company name from the rate-con letterhead. The AI already extracts it
-- (ratecon-ai-contract brokerName); this is where it's kept so the load can show WHO the
-- broker is, not just their MC/phone/email.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_name   TEXT;
-- Geofence arrival stamps for auto-advancing status from GPS (lib/load-status.ts): set
-- the first time the truck is seen at the pickup / delivery, so "was there, now gone" can
-- flip booked→in_transit and in_transit→delivered without a false trigger from a truck
-- that is merely driving toward the stop.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_arrived_at   TIMESTAMPTZ;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_arrived_at TIMESTAMPTZ;
-- Delivery date, alongside the existing pickup_date — both printed on the rate con,
-- both worth tracking on their own (not just as a day-count derived from the pair).
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_date DATE;
-- Raw appointment text as printed on the RC ("07/15/26 12:00 Appt") — the map's
-- pickup pin shows this verbatim, since a bare date loses the actual appointment time.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_time   TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_time TEXT;
-- Full street address, when the RC printed one — the map pin geocodes this instead
-- of origin/destination (city-level) so it lands on the exact building, not the city center.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pickup_address   TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS delivery_address TEXT;

ALTER TABLE loads ADD COLUMN IF NOT EXISTS invoiced_at        TIMESTAMPTZ;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS paid_at            TIMESTAMPTZ;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS invoice_number     TEXT;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NOT NULL DEFAULT 30;

-- The generated invoice PDF is stored as a document — widen the kind check.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_kind_check;
-- 'driverinfo' — лист «Driver Information» (стопы, окна, требования, без ставки):
-- классификатор его отличает от рейт-кона давно, а ограничение не знало — и
-- загрузка такого файла падала на «violates check constraint documents_kind_check».
ALTER TABLE documents ADD CONSTRAINT documents_kind_check
  CHECK (kind IN ('ratecon','bol','pod','driverinfo','invoice','insurance','registration','repair','photo','other'));

-- Soft delete: "deleting" a document moves it to the trash instead of erasing it —
-- only deleting again FROM the trash is unrecoverable.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- A repair receipt uploaded from the maintenance log — real link back to the
-- specific record, not just a matching title, so the row can open its own receipt.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS maintenance_id INTEGER REFERENCES truck_maintenance(id);

-- Which dispatcher (app user) created this load — auto-set at creation, feeds the
-- weekly per-dispatcher/driver report on the Финансы page. NULL for loads created
-- before this existed — nothing to backfill it from.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS dispatcher_id INTEGER REFERENCES users(id);

-- Telegram went from one shared global account to one account PER user. Migrate the
-- single legacy global session (+ its curation) to the first admin as their personal
-- account, then drop the globals so runtime only ever reads the per-user keys. Each
-- copy is idempotent via ON CONFLICT DO NOTHING. The final delete is guarded to fire
-- only once the per-user session actually exists, so a re-run after the admin
-- disconnects cannot resurrect the account. No-op on a fresh install.
INSERT INTO settings (key, value) SELECT 'tg_session:' || u.id, s.value FROM settings s CROSS JOIN (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1) u WHERE s.key='tg_session' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) SELECT 'tg_api_id:' || u.id, s.value FROM settings s CROSS JOIN (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1) u WHERE s.key='tg_api_id' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) SELECT 'tg_api_hash:' || u.id, s.value FROM settings s CROSS JOIN (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1) u WHERE s.key='tg_api_hash' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) SELECT 'tg_shown_chats:' || u.id, s.value FROM settings s CROSS JOIN (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1) u WHERE s.key='tg_shown_chats' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) SELECT 'tg_chat_truck:' || u.id, s.value FROM settings s CROSS JOIN (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1) u WHERE s.key='tg_chat_truck' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) SELECT 'tg_last_seen:' || u.id, s.value FROM settings s CROSS JOIN (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1) u WHERE s.key='tg_last_seen' ON CONFLICT (key) DO NOTHING;
DELETE FROM settings WHERE key IN ('tg_session','tg_api_id','tg_api_hash','tg_shown_chats','tg_chat_truck','tg_last_seen') AND EXISTS (SELECT 1 FROM settings x WHERE x.key = 'tg_session:' || (SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1));

-- Per-dispatcher feature access (lib/capabilities.ts). Only stores OVERRIDES — a
-- missing row means "use the capability's coded default". Admins are never listed
-- here (they implicitly have everything).
CREATE TABLE IF NOT EXISTS user_capabilities (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  capability TEXT NOT NULL,
  allowed    BOOLEAN NOT NULL,
  PRIMARY KEY (user_id, capability)
);
-- Fold the old global "Telegram открыт диспетчерам" switch into the new per-user
-- capability: if it was ON, grant the telegram capability to every current dispatcher
-- (its coded default is OFF, so without this they'd lose access they already had).
INSERT INTO user_capabilities (user_id, capability, allowed) SELECT u.id, 'telegram', TRUE FROM users u WHERE u.role='dispatcher' AND (SELECT value FROM settings WHERE key='tg_dispatcher_access')='1' ON CONFLICT (user_id, capability) DO NOTHING;
DELETE FROM settings WHERE key='tg_dispatcher_access';

-- Live sandbox for the public "Попробовать демо" link (lib/demo.ts): one real user
-- row so sessions/dispatcher_id work exactly like a real dispatcher, but is_demo
-- routes every trucks/loads/documents query at the demo (company_id='demo') data
-- instead of the real fleet. password_hash is deliberately empty — verifyPassword's
-- "salt:hash".split(':') always fails on it, so this account can never be reached by
-- typing a password, only via the dedicated demo-login flow.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
-- The demo account row is NOT seeded here any more. It was already redundant —
-- demoUserId() in lib/demo.ts creates it lazily on the first /demo hit — and this file
-- now runs against customers' databases, where a user row carrying OUR domain in its
-- email address has no business existing.

-- documents has no owning company_id of its own today (only inferred via truck_id/
-- load_id) — the /docs library and /api/docs/[id] list or fetch by raw id with no
-- other scope, so a demo session needs its own direct column to filter by, same as
-- trucks/loads already have. Existing rows default to 'default' (real data), which is
-- already correct for every row that exists before this line ever runs.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT 'default';

-- Broker vetting cache (FMCSA lookup by MC) + basis for our own pay history.
CREATE TABLE IF NOT EXISTS brokers (
  mc                TEXT PRIMARY KEY,
  legal_name        TEXT,
  dba_name          TEXT,
  dot_number        TEXT,
  authority_status  TEXT,
  bond_on_file      BOOLEAN,
  authority_granted DATE,
  address           TEXT,
  phone             TEXT,
  raw               JSONB,
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Manual availability flag: NULL = active, 'repair' = в ремонте, 'vacation' =
-- водитель в отпуске. An unavailable truck is highlighted across the app and never
-- counted as "свободен" on the dashboard.
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS unavailable TEXT
  CHECK (unavailable IN ('repair', 'vacation'));

-- Pre-rendered "Driver Information" block (lib/ratecon.ts formatDriverInfo) — saved
-- once at the moment a rate con is read, so a dispatcher can come back and copy it
-- again from the load page any time, not just in the one browser session right after
-- import. NULL for loads never sourced from an RC (manual entry has nothing to render).
ALTER TABLE loads ADD COLUMN IF NOT EXISTS driver_info TEXT;

-- Which revision of THIS file a database is running. The app is installed per company,
-- so code and schema advance separately: a push reaches every install at once, but each
-- customer's DB only moves when db:init is run against it. /api/health?ready= reports
-- this value, which turns "did I remember to migrate that customer" into one request.
--
-- BUMP THIS whenever a column is added above. Nothing gates on the value — the app must
-- never refuse to start over a version mismatch, because a hard stop is worse than the
-- missing-column error it would be preventing.
-- Журнал сбоев страниц. До него единственным следом упавшей страницы был digest в
-- консоли браузера у того, у кого упало, — на сервере хостинга логи недоступны.
-- Клиентская граница ошибок (app/error.tsx) пишет сюда путь, текст и digest;
-- последние записи видны в Админке. Не журнал всего подряд — только падения.
CREATE TABLE IF NOT EXISTS app_errors (
  id         SERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id TEXT NOT NULL DEFAULT 'default',
  user_id    INTEGER,
  path       TEXT,
  message    TEXT,
  digest     TEXT,
  agent      TEXT
);
CREATE INDEX IF NOT EXISTS app_errors_at ON app_errors(at DESC);

INSERT INTO settings (key, value) VALUES ('schema_version', '2026-09-04')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Через кого брокер платит перевозчикам (TriumphPay, Comdata, RTS…), если рейт-кон
-- это называет. Единственный публично доступный признак того, как до нас дойдут
-- деньги: справочника «MC брокера → факторинговая компания» не существует, потому что
-- факторинг берёт перевозчик, а не брокер. Заполняет ИИ при разборе документа.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS pay_via TEXT;

-- Платные дороги по маршруту груза, доллары. До этой колонки прибыль считалась
-- так, будто дороги бесплатные: на восточных рейсах это трёхзначная ошибка.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS toll_cost NUMERIC;

-- Восстановление пароля без почты. Код выдаётся при создании аккаунта (и
-- перевыпускается из меню), хранится как хеш, тем же PBKDF2, что и пароль.
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash TEXT;
-- Самостоятельная заявка с экрана входа: аккаунт есть, но до подтверждения
-- администратором внутрь не пускает. Подтвердили — колонка обнуляется.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_since TIMESTAMPTZ;

-- Закреплённый за траком диспетчер. Один трак — один ответственный: иначе на вопрос
-- «кто ведёт 1705» отвечают «вроде бы Мартин», а машина простаивает, пока каждый
-- думает, что ею занят другой. У трака может не быть диспетчера (NULL) — так и было
-- до этой колонки, и это законное состояние, а не ошибка.
ALTER TABLE trucks ADD COLUMN IF NOT EXISTS dispatcher_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Пустое поле формы трака когда-то уезжало в базу как NaN (numeric его принимает),
-- и весь трак считал «$NaN». Форма больше так не делает; старые строки чиним тут.
UPDATE trucks SET fixed_cost_per_day = 0 WHERE fixed_cost_per_day = 'NaN';
UPDATE trucks SET maintenance_cost_per_mile = 0 WHERE maintenance_cost_per_mile = 'NaN';
UPDATE trucks SET mpg = 6.5 WHERE mpg = 'NaN' OR mpg <= 0;
UPDATE trucks SET fuel_price_per_gallon = 0 WHERE fuel_price_per_gallon = 'NaN';
UPDATE trucks SET truck_payment_per_day = 0 WHERE truck_payment_per_day = 'NaN';
UPDATE trucks SET insurance_per_day = 0 WHERE insurance_per_day = 'NaN';
UPDATE trucks SET eld_permits_per_day = 0 WHERE eld_permits_per_day = 'NaN';
UPDATE trucks SET factoring_percent = 0 WHERE factoring_percent = 'NaN';
UPDATE trucks SET dispatch_percent = 0 WHERE dispatch_percent = 'NaN';
