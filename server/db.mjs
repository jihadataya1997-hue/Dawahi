// قاعدة بيانات ضواحي — SQLite مدمجة بـ Node (بدون مكتبات خارجية)
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
export const UPLOADS_DIR = join(DATA_DIR, 'uploads')
mkdirSync(UPLOADS_DIR, { recursive: true })

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
