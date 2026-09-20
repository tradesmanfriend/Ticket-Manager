const express = require("express");
const db = require("../db");
const { signToken, checkPassword } = require("../auth");

const router = express.Router();

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

router.post("/login", (req, res) => {
  const { propertySlug, username, password } = req.body || {};
  const slug = (propertySlug || "").toLowerCase().trim();
  const property = db.prepare("SELECT * FROM properties WHERE slug = ?").get(slug);
  if (!property) return res.status(401).json({ error: "No property found with that code." });

  const uname = (username || "").toLowerCase().trim();
  const staffRow = db.prepare("SELECT * FROM staff WHERE property_id = ? AND username = ?").get(property.id, uname);
  if (!staffRow || !staffRow.active || !checkPassword(password || "", staffRow.password_hash)) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }

  res.json({
    token: signToken({ propertyId: property.id, staffId: staffRow.id }),
    property: { slug: property.slug, name: property.name },
    staff: staffToJson(staffRow),
  });
});

module.exports = router;
