const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { canAccessDepartment } = require("../permissions");

const router = express.Router();
router.use(requireAuth);

// Only these fields can ever be changed after a ticket is created — notably
// not `department`, since department is also a permission boundary (see
// below) and reassigning a ticket across it isn't exposed by this API.
const FIELD_TO_COLUMN = {
  vendor: "vendor",
  quoteAmount: "quote_amount",
  scheduledDate: "scheduled_date",
  stage: "stage",
  completedAt: "completed_at",
};

function rowToTicket(row, notes) {
  return {
    id: row.id,
    unit: row.unit,
    department: row.department,
    title: row.title,
    description: row.description,
    severity: row.severity,
    hazard: !!row.hazard,
    stage: row.stage,
    vendor: row.vendor,
    quoteAmount: row.quote_amount,
    scheduledDate: row.scheduled_date,
    reportedAt: row.reported_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    notes: notes.map((n) => ({ id: n.id, ts: n.ts, by: n.by, text: n.text })),
  };
}

function getFullTicket(id) {
  const row = db.prepare("SELECT * FROM tickets WHERE id = ?").get(id);
  if (!row) return null;
  const notes = db.prepare("SELECT * FROM notes WHERE ticket_id = ? ORDER BY ts ASC").all(id);
  return rowToTicket(row, notes);
}

router.get("/", (req, res) => {
  const staff = req.staff;
  let rows;
  if (staff.allDepartments) {
    rows = db.prepare("SELECT * FROM tickets WHERE property_id = ? ORDER BY reported_at DESC").all(req.propertyId);
  } else if (staff.departments.length === 0) {
    rows = [];
  } else {
    const placeholders = staff.departments.map(() => "?").join(",");
    rows = db
      .prepare(`SELECT * FROM tickets WHERE property_id = ? AND department IN (${placeholders}) ORDER BY reported_at DESC`)
      .all(req.propertyId, ...staff.departments);
  }
  const noteStmt = db.prepare("SELECT * FROM notes WHERE ticket_id = ? ORDER BY ts ASC");
  res.json(rows.map((row) => rowToTicket(row, noteStmt.all(row.id))));
});

router.post("/", (req, res) => {
  const staff = req.staff;
  if (!staff.canCreate) return res.status(403).json({ error: "Your account can't create tickets." });

  const b = req.body || {};
  if (!b.unit || !b.unit.toString().trim() || !b.title || !b.title.toString().trim()) {
    return res.status(400).json({ error: "Unit and a short title are required." });
  }
  const department = (b.department || "General").toString();
  if (!canAccessDepartment(staff, department)) {
    return res.status(403).json({ error: "You don't have access to that department." });
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO tickets
        (id, property_id, unit, department, title, description, severity, hazard, stage, vendor, quote_amount, scheduled_date, reported_at, completed_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, '', '', '', ?, NULL, ?)`
    ).run(
      id,
      req.propertyId,
      b.unit.toString().trim(),
      department,
      b.title.toString().trim(),
      b.description || "",
      b.severity || "medium",
      b.hazard ? 1 : 0,
      now,
      staff.displayName
    );
    db.prepare("INSERT INTO notes (id, ticket_id, ts, by, text) VALUES (?, ?, ?, ?, ?)").run(
      crypto.randomUUID(),
      id,
      now,
      staff.displayName,
      "Ticket created."
    );
  });
  run();

  res.status(201).json(getFullTicket(id));
});

router.patch("/:id", (req, res) => {
  const staff = req.staff;
  const existing = db.prepare("SELECT * FROM tickets WHERE id = ? AND property_id = ?").get(req.params.id, req.propertyId);
  if (!existing) return res.status(404).json({ error: "Ticket not found." });
  if (!canAccessDepartment(staff, existing.department)) {
    return res.status(403).json({ error: "You don't have access to this ticket's department." });
  }

  const b = req.body || {};
  const touchesStatusFields = ["stage", "vendor", "scheduledDate"].some((f) => Object.prototype.hasOwnProperty.call(b, f)) || b.note;
  if (touchesStatusFields && !staff.canEditStatus) {
    return res.status(403).json({ error: "Your account can't update ticket status, vendor, or notes." });
  }
  if (Object.prototype.hasOwnProperty.call(b, "quoteAmount") && !staff.canEditFinancials) {
    return res.status(403).json({ error: "Your account can't edit quote amounts." });
  }

  const sets = [];
  const values = [];
  for (const field of Object.keys(FIELD_TO_COLUMN)) {
    if (Object.prototype.hasOwnProperty.call(b, field)) {
      sets.push(`${FIELD_TO_COLUMN[field]} = ?`);
      values.push(b[field]);
    }
  }

  const run = db.transaction(() => {
    if (sets.length) {
      values.push(req.params.id);
      db.prepare(`UPDATE tickets SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }
    if (b.note && b.note.text && b.note.text.trim()) {
      db.prepare("INSERT INTO notes (id, ticket_id, ts, by, text) VALUES (?, ?, ?, ?, ?)").run(
        crypto.randomUUID(),
        req.params.id,
        Date.now(),
        staff.displayName,
        b.note.text.trim()
      );
    }
  });
  run();

  res.json(getFullTicket(req.params.id));
});

router.delete("/:id", (req, res) => {
  const staff = req.staff;
  const existing = db.prepare("SELECT * FROM tickets WHERE id = ? AND property_id = ?").get(req.params.id, req.propertyId);
  if (!existing) return res.status(404).json({ error: "Ticket not found." });
  if (!canAccessDepartment(staff, existing.department)) {
    return res.status(403).json({ error: "You don't have access to this ticket's department." });
  }
  if (!staff.canDelete) return res.status(403).json({ error: "Your account can't delete tickets." });
  db.prepare("DELETE FROM tickets WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
