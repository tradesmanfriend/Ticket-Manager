const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { signToken, hashPassword } = require("../auth");

const router = express.Router();

const DEFAULT_DEPARTMENTS = ["HVAC", "Plumbing", "Electrical", "Painting", "Appliance", "Structural", "Pest Control", "General"];

function slugify(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "property"
  );
}

function staffToJson(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    allDepartments: !!row.all_departments,
    departments: JSON.parse(row.departments || "[]"),
    canCreate: !!row.can_create,
    canEditStatus: !!row.can_edit_status,
    canEditFinancials: !!row.can_edit_financials,
    canDelete: !!row.can_delete,
    canManageProperty: !!row.can_manage_property,
  };
}

// Creates a new property AND its first staff account, who is always a full
// admin — there's no property without at least one person who can manage it.
router.post("/", (req, res) => {
  const { propertyName, username, password, displayName } = req.body || {};
  if (!propertyName || !propertyName.trim()) return res.status(400).json({ error: "Property name is required." });
  if (!username || !username.trim()) return res.status(400).json({ error: "Choose a username for your account." });
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (!displayName || !displayName.trim()) return res.status(400).json({ error: "Your name is required." });

  const existsStmt = db.prepare("SELECT id FROM properties WHERE slug = ?");
  let slug = slugify(propertyName);
  let attempt = 0;
  while (existsStmt.get(slug) && attempt < 6) {
    slug = `${slugify(propertyName)}-${Math.floor(100 + Math.random() * 900)}`;
    attempt += 1;
  }
  if (existsStmt.get(slug)) {
    return res.status(409).json({ error: "Could not generate a unique property code — try a slightly different name." });
  }

  const propertyId = crypto.randomUUID();
  const staffId = crypto.randomUUID();
  const now = Date.now();
  const uname = username.trim().toLowerCase();

  const run = db.transaction(() => {
    db.prepare("INSERT INTO properties (id, slug, name, created_at) VALUES (?, ?, ?, ?)").run(propertyId, slug, propertyName.trim(), now);
    for (const dept of DEFAULT_DEPARTMENTS) {
      db.prepare("INSERT INTO departments (id, property_id, name) VALUES (?, ?, ?)").run(crypto.randomUUID(), propertyId, dept);
    }
    db.prepare(
      `INSERT INTO staff
        (id, property_id, username, password_hash, display_name, role, all_departments, departments, can_create, can_edit_status, can_edit_financials, can_delete, can_manage_property, active, created_at)
       VALUES (?, ?, ?, ?, ?, 'admin', 1, '[]', 1, 1, 1, 1, 1, 1, ?)`
    ).run(staffId, propertyId, uname, hashPassword(password), displayName.trim(), now);
  });
  run();

  const staffRow = db.prepare("SELECT * FROM staff WHERE id = ?").get(staffId);
  res.status(201).json({
    token: signToken({ propertyId, staffId }),
    property: { slug, name: propertyName.trim() },
    staff: staffToJson(staffRow),
  });
});

module.exports = router;
