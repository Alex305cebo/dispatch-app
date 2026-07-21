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

-- Seed one truck so a fresh DB has something to assign loads to.
INSERT INTO trucks (id, name, number, driver_name, mpg, fuel_price_per_gallon,
                    driver_pay_mode, driver_cents_per_mile,
                    truck_payment_per_day, insurance_per_day, eld_permits_per_day,
                    maintenance_cost_per_mile, factoring_percent, dispatch_percent)
VALUES (1, 'Truck 1', '1', '', 6.5, 3.85, 'cpm', 60, 60, 40, 8, 0.18, 2, 0)
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
ALTER TABLE documents ADD CONSTRAINT documents_kind_check
  CHECK (kind IN ('ratecon','bol','pod','invoice','insurance','registration','repair','other'));

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
