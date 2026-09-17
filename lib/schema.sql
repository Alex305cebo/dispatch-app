-- Схема базы — MariaDB (хостинг Hostinger, тот же тариф, что и приложение).
--
-- До 09/13/26 база жила в Neon (Postgres). Бесплатный лимит трафика Neon кончился
-- посреди месяца и остановил приложение, поэтому база переехала туда, где уже
-- работает сайт. Версия под Postgres лежит в git по метке pre-mysql — это и есть
-- откат: код с той метки + данные обратно через scripts/mysql-to-pg.mjs.
--
-- Файл идемпотентен: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, его можно
-- накатывать повторно. Новые колонки — отдельным ALTER … ADD COLUMN IF NOT EXISTS в
-- конце, и не забыть поднять schema_version.
--
-- Почему именно так объявлены типы:
-- • COLLATE utf8mb4_nopad_bin — сравнение и сортировка строк как в Postgres: с учётом
--   регистра и хвостовых пробелов. С обычной _ci-сортировкой 'ABC' = 'abc', и
--   уникальные ключи начали бы конфликтовать там, где Postgres их различал.
-- • DATETIME(6) хранит время в UTC: приложение ставит соединению time_zone '+00:00'
--   (lib/db.ts). Микросекунды — чтобы отметки одной секунды не теряли порядок.
-- • CHECK-ограничения названы как в Postgres: lib/msg.ts узнаёт ошибку по имени
--   колонки в тексте ошибки.
-- • Ключевые текстовые колонки — VARCHAR: MariaDB не индексирует TEXT целиком.

CREATE TABLE IF NOT EXISTS users (
  id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         VARCHAR(320) NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'dispatcher',
  created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  disabled_at   DATETIME(6),
  -- Демо-аккаунт (lib/demo.ts): сессии как у настоящего диспетчера, данные company_id='demo'.
  is_demo       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Код восстановления пароля, хеш PBKDF2.
  recovery_hash TEXT,
  -- Заявка с экрана входа ждёт подтверждения администратора.
  pending_since DATETIME(6),
  UNIQUE KEY users_email_key (email),
  CONSTRAINT users_role_check CHECK (role IN ('admin', 'dispatcher'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- CHECK на trucks и loads повторяют исключения calcLoad (lib/profit.ts): любая строка
-- в loads — годный вход для расчёта, странице груза не надо ловить исключение.
CREATE TABLE IF NOT EXISTS trucks (
  id                        INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id                VARCHAR(64) NOT NULL DEFAULT 'default',
  name                      TEXT NOT NULL,
  number                    VARCHAR(64),
  driver_name               TEXT,
  mpg                       DOUBLE NOT NULL,
  fuel_price_per_gallon     DOUBLE NOT NULL,
  driver_pay_mode           VARCHAR(16) NOT NULL,
  driver_cents_per_mile     DOUBLE,
  driver_percent_of_gross   DOUBLE,
  -- Устаревшая колонка (разнесена на три ниже), ничего её не читает.
  fixed_cost_per_day        DOUBLE NOT NULL DEFAULT 0,
  truck_payment_per_day     DOUBLE NOT NULL DEFAULT 60,
  insurance_per_day         DOUBLE NOT NULL DEFAULT 40,
  eld_permits_per_day       DOUBLE NOT NULL DEFAULT 8,
  maintenance_cost_per_mile DOUBLE NOT NULL,
  factoring_percent         DOUBLE NOT NULL,
  dispatch_percent          DOUBLE NOT NULL,
  -- NULL = в работе, 'repair' = в ремонте, 'vacation' = водитель в отпуске.
  unavailable               VARCHAR(16),
  -- Закреплённый диспетчер; NULL — законное состояние.
  dispatcher_id             INT,
  KEY trucks_company (company_id),
  CONSTRAINT trucks_check CHECK (driver_pay_mode = 'cpm' AND driver_cents_per_mile IS NOT NULL
                              OR driver_pay_mode = 'percent' AND driver_percent_of_gross IS NOT NULL),
  CONSTRAINT trucks_driver_pay_mode_check CHECK (driver_pay_mode IN ('cpm', 'percent')),
  CONSTRAINT trucks_mpg_check CHECK (mpg > 0),
  CONSTRAINT trucks_unavailable_check CHECK (unavailable IN ('repair', 'vacation')),
  CONSTRAINT trucks_dispatcher_id_fkey FOREIGN KEY (dispatcher_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE IF NOT EXISTS loads (
  id                  INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id          VARCHAR(64) NOT NULL DEFAULT 'default',
  truck_id            INT,
  status              VARCHAR(20) NOT NULL DEFAULT 'quoted',
  rate                DOUBLE NOT NULL,
  loaded_miles        DOUBLE NOT NULL,
  deadhead_miles      DOUBLE NOT NULL DEFAULT 0,
  transit_days        DOUBLE NOT NULL DEFAULT 1,
  origin              TEXT,
  destination         TEXT,
  truck_location      TEXT,
  spot_rpm            DOUBLE,
  broker_mc           TEXT,
  broker_email        TEXT,
  broker_phone        TEXT,
  broker_name         TEXT,
  reference_id        TEXT,
  pickup_date         DATE,
  delivery_date       DATE,
  -- Окно как напечатано в рейт-коне («07/15/26 12:00 Appt»).
  pickup_time         TEXT,
  delivery_time       TEXT,
  pickup_address      TEXT,
  delivery_address    TEXT,
  source              VARCHAR(16) NOT NULL DEFAULT 'manual',
  created_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  invoiced_at         DATETIME(6),
  paid_at             DATETIME(6),
  invoice_number      TEXT,
  payment_terms_days  INT NOT NULL DEFAULT 30,
  -- Особые указания брокера; notes_read_at NULL = ещё не прочитаны.
  broker_notes        MEDIUMTEXT,
  notes_read_at       DATETIME(6),
  dispatcher_id       INT,
  -- Готовый текст «Driver Information» из рейт-кона.
  driver_info         MEDIUMTEXT,
  -- Отметки геозоны: трак впервые замечен на погрузке / выгрузке.
  pickup_arrived_at   DATETIME(6),
  delivery_arrived_at DATETIME(6),
  -- Через кого брокер платит (TriumphPay, Comdata…), если рейт-кон это называет.
  pay_via             TEXT,
  -- Платные дороги по маршруту, доллары.
  toll_cost           DOUBLE,
  -- Мили оценены приблизительно — диспетчер видит пометку.
  miles_estimated     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Остановки по порядку рейса (lib/stops.ts); origin/destination — концы рейса.
  stops               JSON,
  -- Партиал: едет в одном трейлере с другим грузом, не вытесняет текущий.
  partial             BOOLEAN NOT NULL DEFAULT FALSE,
  KEY loads_status (status),
  KEY loads_created (created_at),
  KEY loads_truck (truck_id),
  KEY loads_company (company_id, created_at),
  CONSTRAINT loads_status_check CHECK (status IN ('quoted', 'booked', 'in_transit', 'delivered', 'paid', 'cancelled')),
  CONSTRAINT loads_rate_check CHECK (rate >= 0),
  CONSTRAINT loads_loaded_miles_check CHECK (loaded_miles > 0),
  CONSTRAINT loads_deadhead_miles_check CHECK (deadhead_miles >= 0),
  CONSTRAINT loads_transit_days_check CHECK (transit_days > 0),
  CONSTRAINT loads_source_check CHECK (source IN ('manual', 'qr')),
  CONSTRAINT loads_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks (id),
  CONSTRAINT loads_dispatcher_id_fkey FOREIGN KEY (dispatcher_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Настройки ключ-значение (сессии Telegram, кэши геокодера, профиль компании).
-- "key" — зарезервированное слово в MariaDB, в запросах его пишут в кавычках.
CREATE TABLE IF NOT EXISTS settings (
  "key" VARCHAR(255) NOT NULL PRIMARY KEY,
  value LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Журнал входов: кто, откуда, с какого устройства.
CREATE TABLE IF NOT EXISTS logins (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  who        TEXT,
  ip         TEXT,
  user_agent TEXT,
  city       TEXT,
  at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY logins_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Журнал действий (удаление документа и т. п.). Ничего не удаляется каскадом.
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  who        TEXT,
  action     TEXT NOT NULL,
  target     TEXT,
  doc_kind   TEXT,
  from_loc   TEXT,
  to_loc     TEXT,
  ip         TEXT,
  user_agent TEXT,
  city       TEXT,
  at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY audit_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Строка на вошедшее устройство; удалить строку = разлогинить устройство.
CREATE TABLE IF NOT EXISTS sessions (
  token      VARCHAR(128) NOT NULL PRIMARY KEY,
  user_id    INT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  KEY sessions_user (user_id),
  KEY sessions_expires (expires_at),
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Последний снимок трака из ELD, по номеру юнита (= trucks.number).
CREATE TABLE IF NOT EXISTS fleet_status (
  unit         VARCHAR(64) NOT NULL PRIMARY KEY,
  driver_name  TEXT,
  hos_percent  DOUBLE,
  drive_status TEXT,
  location     TEXT,
  lat          DOUBLE,
  lng          DOUBLE,
  odometer     DOUBLE,
  fuel         DOUBLE,
  bearing      DOUBLE,
  eld_seen     TEXT,
  updated_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Точки GPS на каждом опросе; старше 100 дней чистятся при записи (lib/eld.ts).
CREATE TABLE IF NOT EXISTS truck_position_log (
  id           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit         VARCHAR(64) NOT NULL,
  lat          DOUBLE NOT NULL,
  lng          DOUBLE NOT NULL,
  drive_status TEXT,
  location     TEXT,
  at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY position_log_unit_at (unit, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Паспорт трака и водителя: документы, сроки, фото, отсчёт замены масла.
CREATE TABLE IF NOT EXISTS truck_meta (
  truck_id            INT NOT NULL PRIMARY KEY,
  vin                 TEXT,
  plate               TEXT,
  trailer_number      TEXT,
  year                INT,
  make                TEXT,
  model               TEXT,
  oil_interval_mi     DOUBLE NOT NULL DEFAULT 25000,
  oil_last_odometer   DOUBLE,
  driver_phone        TEXT,
  notes               TEXT,
  registration_expiry DATE,
  inspection_expiry   DATE,
  insurance_expiry    DATE,
  cdl_expiry          DATE,
  medcard_expiry      DATE,
  driver_photo        LONGBLOB,
  driver_photo_mime   TEXT,
  truck_photo         LONGBLOB,
  truck_photo_mime    TEXT,
  -- Готовая картинка трака из public/trucks (lib/truck-models.ts); NULL — стандартная.
  truck_model         TEXT,
  CONSTRAINT truck_meta_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE IF NOT EXISTS truck_maintenance (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  truck_id   INT NOT NULL,
  kind       VARCHAR(16) NOT NULL,
  title      TEXT NOT NULL,
  notes      TEXT,
  cost       DOUBLE,
  odometer   DOUBLE,
  done_at    DATE NOT NULL DEFAULT (CURDATE()),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY maint_truck (truck_id, done_at),
  CONSTRAINT truck_maintenance_kind_check CHECK (kind IN ('repair', 'service', 'inspection')),
  CONSTRAINT truck_maintenance_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Документы (рейт-коны, BOL/POD, счета, фото) — файлы лежат прямо в базе.
-- deleted_at — корзина: первое удаление обратимо.
CREATE TABLE IF NOT EXISTS documents (
  id             INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id     VARCHAR(64) NOT NULL DEFAULT 'default',
  truck_id       INT,
  load_id        INT,
  maintenance_id INT,
  kind           VARCHAR(20) NOT NULL DEFAULT 'other',
  title          TEXT NOT NULL,
  mime           TEXT NOT NULL,
  size_bytes     INT NOT NULL,
  data           LONGBLOB NOT NULL,
  -- Миниатюра 160px для списка (app/api/docs/[id]?thumb=1), считается один раз.
  thumb          LONGBLOB,
  -- POD промежуточной выгрузки: номер остановки (lib/stops.ts); NULL — конечная.
  stop_seq       INT,
  uploaded_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at     DATETIME(6),
  KEY docs_truck (truck_id),
  KEY docs_load (load_id),
  KEY docs_company (company_id, uploaded_at),
  CONSTRAINT documents_kind_check CHECK (kind IN ('ratecon', 'bol', 'pod', 'driverinfo', 'invoice', 'insurance', 'registration', 'repair', 'photo', 'other')),
  CONSTRAINT documents_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks (id),
  CONSTRAINT documents_load_id_fkey FOREIGN KEY (load_id) REFERENCES loads (id),
  CONSTRAINT documents_maintenance_id_fkey FOREIGN KEY (maintenance_id) REFERENCES truck_maintenance (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

CREATE TABLE IF NOT EXISTS truck_todos (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  truck_id   INT NOT NULL,
  title      TEXT NOT NULL,
  notes      TEXT,
  priority   VARCHAR(16) NOT NULL DEFAULT 'normal',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  done_at    DATETIME(6),
  KEY todos_truck (truck_id, done_at, created_at),
  CONSTRAINT truck_todos_priority_check CHECK (priority IN ('low', 'normal', 'urgent')),
  CONSTRAINT truck_todos_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Доступ диспетчера к функциям (lib/capabilities.ts): только отличия от умолчаний.
CREATE TABLE IF NOT EXISTS user_capabilities (
  user_id    INT NOT NULL,
  capability VARCHAR(64) NOT NULL,
  allowed    BOOLEAN NOT NULL,
  PRIMARY KEY (user_id, capability),
  CONSTRAINT user_capabilities_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Кэш проверки брокера в FMCSA по MC.
CREATE TABLE IF NOT EXISTS brokers (
  mc                VARCHAR(32) NOT NULL PRIMARY KEY,
  legal_name        TEXT,
  dba_name          TEXT,
  dot_number        TEXT,
  authority_status  TEXT,
  bond_on_file      BOOLEAN,
  authority_granted DATE,
  address           TEXT,
  phone             TEXT,
  raw               JSON,
  checked_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Журнал падений страниц (app/error.tsx пишет сюда, видно в Админке).
CREATE TABLE IF NOT EXISTS app_errors (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  company_id VARCHAR(64) NOT NULL DEFAULT 'default',
  user_id    INT,
  path       TEXT,
  message    MEDIUMTEXT,
  digest     TEXT,
  agent      TEXT,
  KEY app_errors_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Хронология рейса от водителя (страница /d/<token>): приехал, загрузился, выгрузился.
CREATE TABLE IF NOT EXISTS load_events (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL DEFAULT 'default',
  load_id    INT,
  truck_id   INT,
  kind       VARCHAR(32) NOT NULL,
  note       TEXT,
  -- Какой остановки касается отметка (lib/stops.ts eventSeq); NULL у старых.
  stop_seq   INT,
  at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY load_events_load (load_id),
  KEY load_events_at (company_id, at),
  CONSTRAINT load_events_load_id_fkey FOREIGN KEY (load_id) REFERENCES loads (id) ON DELETE CASCADE,
  CONSTRAINT load_events_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES trucks (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Заглушка, чтобы на пустой базе было к чему привязать первый груз (lib/loads.ts
-- defaultTruck). Ставки нулевые нарочно: чужие цифры в новой установке выглядели бы
-- авторитетно. mpg не ноль — calcLoad на него делит.
INSERT INTO trucks (id, name, number, driver_name, mpg, fuel_price_per_gallon,
                    driver_pay_mode, driver_cents_per_mile,
                    truck_payment_per_day, insurance_per_day, eld_permits_per_day,
                    maintenance_cost_per_mile, factoring_percent, dispatch_percent)
VALUES (1, 'Трак не настроен', '1', '', 6.5, 0, 'cpm', 0, 0, 0, 0, 0, 0, 0)
ON DUPLICATE KEY UPDATE id = id;

-- Какая ревизия этого файла стоит в базе (/api/health?ready=). ПОДНЯТЬ при каждой
-- новой колонке. Ничего не блокирует: приложение не отказывается стартовать.
-- Как заехать к каждой остановке — маршрут, въезд, ворота, «если склад выглядит закрытым,
-- вы не там», дословно из рейт-кона: [{seq, role, text}] (lib/stops.ts StopDirection).
-- Отдельной колонкой, а не внутри stops: JSON остановок хранится только у грузов с тремя
-- и больше точками, а указания бывают и у обычного груза.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS directions JSON;
-- Deadhead, который диспетчер подтвердил или вписал сам: красный флаг «больше 150 миль»
-- у такого груза не показывается, пока Deadhead снова не изменится.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS deadhead_ok_miles INT NULL;
-- Флаг диспетчера «за этим грузом следить»: caution / important / critical (как в Alvys).
-- Поднимает груз наверх очереди внимания; NULL — обычный груз.
ALTER TABLE loads ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NULL;

-- Профиль водителя для планировщика (идея LoadOps Load AI / Uber «go home»): домашний
-- штат, дома с… по…, цель недели и стоп-лист штатов «не возить в…» (коды через запятую).
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS home_state VARCHAR(2) NULL;
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS home_from DATE NULL;
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS home_to DATE NULL;
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS week_target_miles INT NULL;
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS week_target_gross INT NULL;
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS avoid_states TEXT NULL;
-- Цель по ставке, $/mi гружёных миль: вписывает диспетчер, груз показывает «в цели» или сколько не хватает.
ALTER TABLE truck_meta ADD COLUMN IF NOT EXISTS target_rpm DOUBLE NULL;

-- Доп. начисления брокеру сверх ставки: detention, lumper, TONU, layover, stop-off.
-- Строками уходят в счёт (lib/invoice.ts); ставка груза (loads.rate) не меняется.
CREATE TABLE IF NOT EXISTS load_charges (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_id VARCHAR(64) NOT NULL DEFAULT 'default',
  load_id    INT NOT NULL,
  kind       VARCHAR(16) NOT NULL,
  amount     DOUBLE NOT NULL,
  note       TEXT,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY load_charges_load (load_id),
  CONSTRAINT load_charges_kind_check CHECK (kind IN ('detention', 'lumper', 'tonu', 'layover', 'stop_off', 'other')),
  CONSTRAINT load_charges_load_id_fkey FOREIGN KEY (load_id) REFERENCES loads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Деньги за груз: путь через факторинг (OTR Solutions) или прямая оплата (lib/payments.ts).
-- Одна строка на груз. Этап и даты шагов; суммы аванса и комиссии — как пришли от
-- факторинга. Груз «Оплачен» ставится, когда деньги у нас (профинансирован / оплачен
-- напрямую) — прежние отчёты по loads.paid_at работают как раньше.
CREATE TABLE IF NOT EXISTS load_payments (
  load_id           INT NOT NULL PRIMARY KEY,
  company_id        VARCHAR(64) NOT NULL DEFAULT 'default',
  method            VARCHAR(16) NOT NULL DEFAULT 'factoring',
  factor_name       TEXT,
  stage             VARCHAR(16) NOT NULL,
  submitted_on      DATE,
  factor_ref        TEXT,
  funded_on         DATE,
  advance_amount    DOUBLE,
  fee_amount        DOUBLE,
  closed_on         DATE,
  rejected_on       DATE,
  reject_reason     TEXT,
  chargeback_on     DATE,
  chargeback_amount DOUBLE,
  paid_via          VARCHAR(16),
  paid_on           DATE,
  paid_amount       DOUBLE,
  paid_ref          TEXT,
  note              TEXT,
  updated_by        INT,
  updated_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY load_payments_company (company_id, stage),
  CONSTRAINT load_payments_stage_check CHECK (stage IN ('submitted', 'funded', 'closed', 'rejected', 'chargeback', 'paid')),
  CONSTRAINT load_payments_method_check CHECK (method IN ('factoring', 'direct')),
  CONSTRAINT load_payments_paid_via_check CHECK (paid_via IN ('ach', 'check', 'quickpay', 'other')),
  CONSTRAINT load_payments_load_id_fkey FOREIGN KEY (load_id) REFERENCES loads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

-- Спот-ставки DAT RateView по направлениям с доски DAT One — присылает расширение
-- DispatchPro (app/api/dat-lanes). Одно направление в день — одна строка.
CREATE TABLE IF NOT EXISTS dat_lanes (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id   VARCHAR(64) NOT NULL DEFAULT 'default',
  origin       VARCHAR(120) NOT NULL,
  dest         VARCHAR(120) NOT NULL,
  origin_state CHAR(2),
  dest_state   CHAR(2),
  equipment    VARCHAR(16) NOT NULL DEFAULT 'VAN',
  miles        INT NOT NULL,
  spot_rate    INT NOT NULL,
  spot_rpm     DOUBLE NOT NULL,
  spot_low     INT,
  spot_high    INT,
  seen_on      DATE NOT NULL,
  seen_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY dat_lanes_day (company_id, origin, dest, equipment, seen_on),
  KEY dat_lanes_state (company_id, origin_state, seen_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_nopad_bin;

INSERT INTO settings ("key", value) VALUES ('schema_version', '2026-09-21')
ON DUPLICATE KEY UPDATE value = VALUES(value);
