const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "tickets.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(property_id, name)
  );

  -- One row per staff login. Permissions are individual booleans rather than
  -- a fixed role table, because the brief asks for adjustable per-person
  -- permissions, not just a small set of fixed roles. 'role' is stored too,
  -- but only as a label/preset — every permission check in the routes reads
  -- the boolean columns, never the role string.
  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff',
    all_departments INTEGER NOT NULL DEFAULT 0,
    departments TEXT NOT NULL DEFAULT '[]',
    can_create INTEGER NOT NULL DEFAULT 1,
    can_edit_status INTEGER NOT NULL DEFAULT 1,
    can_edit_financials INTEGER NOT NULL DEFAULT 0,
    can_delete INTEGER NOT NULL DEFAULT 0,
    can_manage_property INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    UNIQUE(property_id, username)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'General',
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    severity TEXT NOT NULL DEFAULT 'medium',
    hazard INTEGER NOT NULL DEFAULT 0,
    stage INTEGER NOT NULL DEFAULT 0,
    vendor TEXT DEFAULT '',
    quote_amount TEXT DEFAULT '',
    scheduled_date TEXT DEFAULT '',
    reported_at INTEGER NOT NULL,
    completed_at INTEGER,
    created_by TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    ts INTEGER NOT NULL,
    by TEXT DEFAULT '',
    text TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_property ON tickets(property_id);
  CREATE INDEX IF NOT EXISTS idx_notes_ticket ON notes(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_staff_property ON staff(property_id);
  CREATE INDEX IF NOT EXISTS idx_departments_property ON departments(property_id);
`);

module.exports = db;
