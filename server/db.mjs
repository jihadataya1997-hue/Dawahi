// قاعدة بيانات ضواحي — SQLite مدمجة بـ Node (بدون مكتبات خارجية)
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
export const UPLOADS_DIR = join(DATA_DIR, 'uploads')
export const MEDIA_DIR = join(DATA_DIR, 'media') // صور الإعلانات (عامة)
mkdirSync(UPLOADS_DIR, { recursive: true })
mkdirSync(MEDIA_DIR, { recursive: true })

export const db = new DatabaseSync(join(DATA_DIR, 'dawahi.db'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')

// كل تعديل على شكل القاعدة يُضاف كخطوة جديدة بالآخر — لا نعدّل خطوة قديمة أبداً
const MIGRATIONS = [
  `
  CREATE TABLE customers (
    id          INTEGER PRIMARY KEY,
    phone       TEXT NOT NULL UNIQUE CHECK (phone GLOB '09[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
    name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE sessions (
    token_hash   TEXT PRIMARY KEY,
    customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX sessions_customer ON sessions(customer_id);

  CREATE TABLE orders (
    id             INTEGER PRIMARY KEY,
    customer_id    INTEGER NOT NULL REFERENCES customers(id),
    client_key     TEXT NOT NULL,                -- يمنع تكرار الطلب إذا ضغط الزبون مرتين أو انقطع النت
    kind           TEXT NOT NULL CHECK (kind IN ('custom','gas')),
    status         TEXT NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','assigned','buying','on_the_way','delivered','cancelled')),
    category       TEXT NOT NULL,
    details        TEXT NOT NULL CHECK (json_valid(details)),
    lat            REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng            REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
    address        TEXT NOT NULL DEFAULT '',
    floor          INTEGER NOT NULL DEFAULT 0 CHECK (floor BETWEEN 0 AND 30),
    contact_phone  TEXT NOT NULL,
    notes          TEXT NOT NULL DEFAULT '',
    photo          TEXT,
    delivery_fee   INTEGER NOT NULL CHECK (delivery_fee >= 0),
    created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (customer_id, client_key)
  );
  CREATE INDEX orders_customer_created ON orders(customer_id, created_at DESC);
  CREATE INDEX orders_status_created ON orders(status, created_at);

  -- سجل كل تغيير بحالة الطلب (مين وإيمتى)
  CREATE TABLE order_events (
    id         INTEGER PRIMARY KEY,
    order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,
    actor      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX order_events_order ON order_events(order_id, id);

  -- الأسعار وإعدادات قابلة للتعديل من لوحة التحكم لاحقاً
  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT INTO settings (key, value) VALUES
    ('delivery_fee', '15000'),
    ('gas_price', '150000'),
    ('empty_cylinder_price', '350000'),
    ('stairs_fee_per_floor', '2000');
  `,
  `
  -- لوحة التحكم: اسم شب التوصيل على الطلب + جلسات المدير
  ALTER TABLE orders ADD COLUMN courier_name TEXT NOT NULL DEFAULT '';

  CREATE TABLE admin_sessions (
    token_hash  TEXT PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at  TEXT NOT NULL
  );
  `,
  `
  -- رقم شب التوصيل (لإرسال الطلب له على واتساب)
  ALTER TABLE orders ADD COLUMN courier_phone TEXT NOT NULL DEFAULT '';
  `,
  `
  -- حسابات شباب التوصيل + التنبيهات (Web Push)
  CREATE TABLE couriers (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    phone       TEXT NOT NULL UNIQUE CHECK (phone GLOB '09[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
    pin_hash    TEXT NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE courier_sessions (
    token_hash  TEXT PRIMARY KEY,
    courier_id  INTEGER NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX courier_sessions_courier ON courier_sessions(courier_id);

  ALTER TABLE orders ADD COLUMN courier_id INTEGER REFERENCES couriers(id);
  CREATE INDEX orders_courier_status ON orders(courier_id, status);

  CREATE TABLE push_subscriptions (
    id          INTEGER PRIMARY KEY,
    owner_type  TEXT NOT NULL CHECK (owner_type IN ('courier','admin','customer')),
    owner_id    INTEGER NOT NULL,
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX push_owner ON push_subscriptions(owner_type, owner_id);

  -- مفاتيح سرية يولّدها السيرفر لنفسه (مثل مفاتيح التنبيهات)
  CREATE TABLE secrets (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  -- التوزيع التلقائي: عروض الطلبات على الشباب
  ALTER TABLE couriers ADD COLUMN online INTEGER NOT NULL DEFAULT 0 CHECK (online IN (0,1));
  ALTER TABLE couriers ADD COLUMN last_assigned_at TEXT;
  ALTER TABLE couriers ADD COLUMN missed_offers INTEGER NOT NULL DEFAULT 0;

  ALTER TABLE orders ADD COLUMN dispatch_round INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE orders ADD COLUMN next_dispatch_at TEXT;

  CREATE TABLE order_offers (
    id           INTEGER PRIMARY KEY,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    courier_id   INTEGER NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
    round        INTEGER NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined','expired','cancelled')),
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at   TEXT NOT NULL,
    responded_at TEXT
  );
  -- ضمان على مستوى القاعدة: الطلب الواحد ما بيكون معروض على أكتر من شب بنفس اللحظة
  CREATE UNIQUE INDEX order_offers_one_pending ON order_offers(order_id) WHERE status = 'pending';
  CREATE INDEX order_offers_courier ON order_offers(courier_id, status);
  CREATE INDEX order_offers_pending_exp ON order_offers(status, expires_at);

  INSERT INTO settings (key, value) VALUES
    ('auto_dispatch', '1'),
    ('offer_timeout_sec', '60'),
    ('max_orders_per_courier', '3');
  `,
  `
  -- العملة السورية الجديدة: حذف صفرين (كل 100 ليرة قديمة = 1 ليرة جديدة)
  UPDATE settings SET value = CAST(ROUND(CAST(value AS REAL) / 100) AS INTEGER)
    WHERE key IN ('delivery_fee','gas_price','empty_cylinder_price','stairs_fee_per_floor');
  UPDATE orders SET delivery_fee = CAST(ROUND(delivery_fee / 100.0) AS INTEGER);
  UPDATE orders SET details = json_set(details,
      '$.estimate', CAST(ROUND(json_extract(details,'$.estimate') / 100.0) AS INTEGER),
      '$.prices.gasPrice', CAST(ROUND(json_extract(details,'$.prices.gasPrice') / 100.0) AS INTEGER),
      '$.prices.emptyCylinderPrice', CAST(ROUND(json_extract(details,'$.prices.emptyCylinderPrice') / 100.0) AS INTEGER),
      '$.prices.stairsFee', CAST(ROUND(json_extract(details,'$.prices.stairsFee') / 100.0) AS INTEGER))
    WHERE kind = 'gas';

  -- محتوى التطبيق القابل للتعديل من لوحة الإدارة (نصوص، خدمات، عملة، دعم)
  CREATE TABLE content (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT INTO content (key, value) VALUES
    ('area_name', 'ضاحية قدسيا'),
    ('currency_label', 'ل.س'),
    ('hero_title', 'اطلب ما تحتاجه من أي محل'),
    ('hero_sub', 'اكتب طلبك، وعامل التوصيل يشتريه ويوصله إلى باب بيتك'),
    ('support_phone', ''),
    ('services', '[{"id":"restaurants","enabled":true,"label":"مطاعم","sub":"من أي مطعم"},{"id":"supermarket","enabled":true,"label":"سوبرماركت","sub":"حاجيات البيت"},{"id":"gas","enabled":true,"label":"غاز","sub":"تبديل الجرة"},{"id":"diesel","enabled":true,"label":"مازوت","sub":"تعبئة"},{"id":"pharmacy","enabled":true,"label":"صيدلية","sub":"أدوية"},{"id":"library","enabled":true,"label":"مكتبات","sub":"قرطاسية"}]');

  -- الإعلانات (السلايدر أعلى التطبيق)
  CREATE TABLE banners (
    id           INTEGER PRIMARY KEY,
    title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
    subtitle     TEXT NOT NULL DEFAULT '',
    badge        TEXT NOT NULL DEFAULT '',
    image        TEXT,
    theme        TEXT NOT NULL DEFAULT 'orange' CHECK (theme IN ('orange','navy','green','sky','rose','purple')),
    action       TEXT NOT NULL DEFAULT 'none' CHECK (action IN ('none','order','gas','url')),
    action_value TEXT NOT NULL DEFAULT '',
    sort         INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    starts_at    TEXT,
    ends_at      TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO banners (title, subtitle, badge, theme, action, action_value, sort) VALUES
    ('اطلب من أي محل في ضاحية قدسيا', 'مطعم، سوبرماركت، صيدلية… ونوصله لك', 'جديد', 'orange', 'order', 'any', 1),
    ('توصيل الغاز إلى باب بيتك', 'نبدّل الجرة ونطلعها لك حتى بدون مصعد', 'خدمة', 'navy', 'gas', '', 2),
    ('صيدلية مناوبة؟ نحن نجلب الدواء', 'صوّر الوصفة وأرسلها مع طلبك', 'دائماً', 'green', 'order', 'pharmacy', 3);

  -- الإشعارات العامة لكل الزبائن
  CREATE TABLE announcements (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
    body        TEXT NOT NULL DEFAULT '',
    sent_count  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  ALTER TABLE customers ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0,1));
  `,
  `
  -- فريق العمل والصلاحيات (أدوار قابلة للتعديل)
  CREATE TABLE roles (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 40),
    permissions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions)),
    is_system   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO roles (name, permissions, is_system) VALUES
    ('مدير', '["orders.view","orders.manage","couriers.manage","customers.view","customers.manage","content.manage","pricing.manage","backups.manage"]', 1),
    ('مشرف', '["orders.view","orders.manage","couriers.manage","customers.view"]', 1),
    ('خدمة عملاء', '["orders.view","customers.view","customers.manage"]', 1),
    ('مسؤول محتوى', '["content.manage"]', 1);

  CREATE TABLE staff (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 60),
    phone         TEXT NOT NULL UNIQUE CHECK (phone GLOB '09[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
    password_hash TEXT NOT NULL,
    role_id       INTEGER NOT NULL REFERENCES roles(id),
    active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    last_login_at TEXT,
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX staff_role ON staff(role_id);

  -- الجلسة إما للمالك (staff_id فارغ) أو لعضو بالفريق
  ALTER TABLE admin_sessions ADD COLUMN staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE;
  `,
  `
  -- المراقبة الحية: موقع عامل التوصيل الأخير
  ALTER TABLE couriers ADD COLUMN lat REAL CHECK (lat IS NULL OR lat BETWEEN -90 AND 90);
  ALTER TABLE couriers ADD COLUMN lng REAL CHECK (lng IS NULL OR lng BETWEEN -180 AND 180);
  ALTER TABLE couriers ADD COLUMN loc_accuracy REAL;
  ALTER TABLE couriers ADD COLUMN loc_at TEXT;

  -- زوار كل يوم (جهاز واحد يُحسب مرة باليوم لكل تطبيق)
  CREATE TABLE app_visits (
    day       TEXT NOT NULL,
    device_id TEXT NOT NULL,
    app       TEXT NOT NULL CHECK (app IN ('customer','driver','download')),
    PRIMARY KEY (day, app, device_id)
  ) WITHOUT ROWID;

  -- الأجهزة اللي ثبّتت التطبيق على الشاشة الرئيسية
  CREATE TABLE app_installs (
    device_id  TEXT PRIMARY KEY,
    app        TEXT NOT NULL CHECK (app IN ('customer','driver')),
    created_at TEXT NOT NULL
  );
  CREATE INDEX app_installs_created ON app_installs(app, created_at);
  `,
  `
  -- عنوان الصفحة الرئيسية الجديد (فقط إذا ما تعدّل من الإدارة)
  UPDATE content SET value = 'شو بدك نجيبلك اليوم؟' WHERE key = 'hero_title' AND value = 'اطلب ما تحتاجه من أي محل';
  UPDATE content SET value = 'اكتب طلبك من أي محل، وعامل التوصيل بيشتريه وبيوصله لباب بيتك.'
    WHERE key = 'hero_sub' AND value = 'اكتب طلبك، وعامل التوصيل يشتريه ويوصله إلى باب بيتك';
  `,
  `
  -- عناوين الزبون المحفوظة
  CREATE TABLE customer_addresses (
    id          INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label       TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 30),
    lat         REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng         REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
    details     TEXT NOT NULL DEFAULT '',
    floor       INTEGER NOT NULL DEFAULT 0 CHECK (floor BETWEEN 0 AND 30),
    elevator    INTEGER NOT NULL DEFAULT 1 CHECK (elevator IN (0,1)),
    is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX customer_addresses_customer ON customer_addresses(customer_id, is_default DESC, updated_at DESC);
  `,
]

db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
const current = db.prepare('SELECT version FROM schema_version').get()?.version ?? 0
if (current === 0) db.exec('INSERT INTO schema_version (version) VALUES (0)')
for (let v = current; v < MIGRATIONS.length; v++) {
  db.exec('BEGIN')
  try {
    db.exec(MIGRATIONS[v])
    db.prepare('UPDATE schema_version SET version = ?').run(v + 1)
    db.exec('COMMIT')
    console.log(JSON.stringify({ level: 'info', msg: 'migration applied', version: v + 1 }))
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]))
}

// محتوى التطبيق القابل للتعديل
export function getContent() {
  const rows = db.prepare('SELECT key, value FROM content').all()
  const c = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  try {
    c.services = JSON.parse(c.services || '[]')
  } catch {
    c.services = []
  }
  return c
}
