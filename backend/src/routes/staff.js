const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");
const { hashPassword, checkPassword } = require("../auth");

const router = express.Router();
router.use(requireAuth);

function rowToStaff(row) {
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
    active: !!row.active,
  };
}

function requireManageProperty(req, res, next) {
  if (!req.staff.canManageProperty) {
    return res.status(403).json({ error: "You don't have permission to manage the team." });
  }
  next();
}

// A property must always keep at least one active account that can manage
// it, or nobody could ever fix a mistake. This checks that a change
// wouldn't remove the last one.
function wouldRemoveLastManager(propertyId, row, patch) {
  const losingManageRight = Object.prototype.hasOwnProperty.call(patch, "canManageProperty") && !patch.canManageProperty;
  const losingActive = Object.prototype.hasOwnProperty.call(patch, "active") && !patch.active;
  if (!row.can_manage_property || !(losingManageRight || losingActive)) return false;
  const otherManagers = db
    .prepare("SELECT COUNT(*) as c FROM staff WHERE property_id = ? AND can_manage_property = 1 AND active = 1 AND id != ?")
    .get(propertyId, row.id).c;
  return otherManagers === 0;
}

// -- Self-service: any logged-in staff member can manage their own profile --

router.get("/me", (req, res) => {
  const row = db.prepare("SELECT * FROM staff WHERE id = ?").get(req.staffId);
  res.json(rowToStaff(row));
});

router.patch("/me", (req, res) => {
  const { displayName } = req.body || {};
  if (!displayName || !displayName.trim()) return res.status(400).json({ error: "Name is required." });
  db.prepare("UPDATE staff SET display_name = ? WHERE id = ?").run(displayName.trim(), req.staffId);
  res.json(rowToStaff(db.prepare("SELECT * FROM staff WHERE id = ?").get(req.staffId)));
});

router.patch("/me/password", (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const row = db.prepare("SELECT * FROM staff WHERE id = ?").get(req.staffId);
  if (!checkPassword(currentPassword || "", row.password_hash)) {
    return res.status(401).json({ error: "Current password is incorrect." });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }
  db.prepare("UPDATE staff SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), req.staffId);
  res.json({ ok: true });
});

// -- Team management: requires canManageProperty --

router.get("/", requireManageProperty, (req, res) => {
  const rows = db.prepare("SELECT * FROM staff WHERE property_id = ? ORDER BY created_at ASC").all(req.propertyId);
  res.json(rows.map(rowToStaff));
});

router.post("/", requireManageProperty, (req, res) => {
  const b = req.body || {};
  if (!b.username || !b.username.trim() || !b.password || b.password.length < 6 || !b.displayName || !b.displayName.trim()) {
    return res.status(400).json({ error: "Username, a password of 6+ characters, and a display name are required." });
  }
  const username = b.username.trim().toLowerCase();
  const exists = db.prepare("SELECT id FROM staff WHERE property_id = ? AND username = ?").get(req.propertyId, username);
  if (exists) return res.status(409).json({ error: "That username is already taken on this property." });

  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO staff
      (id, property_id, username, password_hash, display_name, role, all_departments, departments, can_create, can_edit_status, can_edit_financials, can_delete, can_manage_property, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    id,
    req.propertyId,
    username,
    hashPassword(b.password),
    b.displayName.trim(),
    b.role || "staff",
    b.allDepartments ? 1 : 0,
    JSON.stringify(Array.isArray(b.departments) ? b.departments : []),
    b.canCreate ? 1 : 0,
    b.canEditStatus ? 1 : 0,
    b.canEditFinancials ? 1 : 0,
    b.canDelete ? 1 : 0,
    b.canManageProperty ? 1 : 0,
    now
  );
  res.status(201).json(rowToStaff(db.prepare("SELECT * FROM staff WHERE id = ?").get(id)));
});

router.patch("/:id", requireManageProperty, (req, res) => {
  const row = db.prepare("SELECT * FROM staff WHERE id = ? AND property_id = ?").get(req.params.id, req.propertyId);
  if (!row) return res.status(404).json({ error: "Staff member not found." });

  const b = req.body || {};
  if (wouldRemoveLastManager(req.propertyId, row, b)) {
    return res.status(400).json({ error: "This is the only team member who can manage the property — promote someone else first." });
  }

  const columnFor = {
    displayName: "display_name",
    role: "role",
    allDepartments: "all_departments",
    departments: "departments",
    canCreate: "can_create",
    canEditStatus: "can_edit_status",
    canEditFinancials: "can_edit_financials",
    canDelete: "can_delete",
    canManageProperty: "can_manage_property",
    active: "active",
  };
  const boolFields = new Set(["allDepartments", "canCreate", "canEditStatus", "canEditFinancials", "canDelete", "canManageProperty", "active"]);

  const sets = [];
  const values = [];
  for (const [field, column] of Object.entries(columnFor)) {
    if (!Object.prototype.hasOwnProperty.call(b, field)) continue;
    let value = b[field];
    if (field === "departments") value = JSON.stringify(Array.isArray(value) ? value : []);
    else if (boolFields.has(field)) value = value ? 1 : 0;
    sets.push(`${column} = ?`);
    values.push(value);
  }
  if (sets.length) {
    values.push(req.params.id);
    db.prepare(`UPDATE staff SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }
  res.json(rowToStaff(db.prepare("SELECT * FROM staff WHERE id = ?").get(req.params.id)));
});

router.patch("/:id/password", requireManageProperty, (req, res) => {
  const row = db.prepare("SELECT id FROM staff WHERE id = ? AND property_id = ?").get(req.params.id, req.propertyId);
  if (!row) return res.status(404).json({ error: "Staff member not found." });
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters." });
  }
  db.prepare("UPDATE staff SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), req.params.id);
  res.json({ ok: true });
});

router.delete("/:id", requireManageProperty, (req, res) => {
  if (req.params.id === req.staffId) {
    return res.status(400).json({ error: "You can't remove your own account." });
  }
  const row = db.prepare("SELECT * FROM staff WHERE id = ? AND property_id = ?").get(req.params.id, req.propertyId);
  if (!row) return res.status(404).json({ error: "Staff member not found." });
  if (wouldRemoveLastManager(req.propertyId, row, { active: false })) {
    return res.status(400).json({ error: "This is the only team member who can manage the property — promote someone else first." });
  }
  // Soft delete: keeps the account's history (it's referenced by name in
  // ticket notes) but blocks login and frees the username for reuse only
  // after a real removal — active=0 is enough for requireAuth to reject it.
  db.prepare("UPDATE staff SET active = 0 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
