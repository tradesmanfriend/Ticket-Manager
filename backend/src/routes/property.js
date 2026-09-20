const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const property = db.prepare("SELECT slug, name, created_at as createdAt FROM properties WHERE id = ?").get(req.propertyId);
  if (!property) return res.status(404).json({ error: "Property not found." });
  res.json(property);
});

router.patch("/", (req, res) => {
  if (!req.staff.canManageProperty) {
    return res.status(403).json({ error: "You don't have permission to rename the property." });
  }
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required." });
  db.prepare("UPDATE properties SET name = ? WHERE id = ?").run(name.trim(), req.propertyId);
  res.json({ ok: true });
});

module.exports = router;
