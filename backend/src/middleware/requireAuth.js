const db = require("../db");
const { verifyToken } = require("../auth");

// Verifies the token, then re-reads the staff row from the database on
// every request (rather than trusting permissions baked into the token).
// That's what makes a permission change by an admin take effect
// immediately, instead of waiting for the affected person to log out and
// back in.
module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token." });

  let payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }

  const row = db.prepare("SELECT * FROM staff WHERE id = ? AND property_id = ?").get(payload.staffId, payload.propertyId);
  if (!row || !row.active) {
    return res.status(401).json({ error: "Your account is no longer active. Contact your property admin." });
  }

  req.propertyId = payload.propertyId;
  req.staffId = row.id;
  req.staff = {
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
  next();
};
