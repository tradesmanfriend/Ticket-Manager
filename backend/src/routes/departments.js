const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT id, name FROM departments WHERE property_id = ? ORDER BY name ASC").all(req.propertyId);
  res.json(rows);
});

router.post("/", (req, res) => {
  if (!req.staff.canManageProperty) {
    return res.status(403).json({ error: "You don't have permission to manage departments." });
  }
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Department name is required." });
  const exists = db.prepare("SELECT id FROM departments WHERE property_id = ? AND name = ?").get(req.propertyId, name);
  if (exists) return res.status(409).json({ error: "That department already exists." });
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO departments (id, property_id, name) VALUES (?, ?, ?)").run(id, req.propertyId, name);
  res.status(201).json({ id, name });
});

router.delete("/:id", (req, res) => {
  if (!req.staff.canManageProperty) {
    return res.status(403).json({ error: "You don't have permission to manage departments." });
  }
  const row = db.prepare("SELECT * FROM departments WHERE id = ? AND property_id = ?").get(req.params.id, req.propertyId);
  if (!row) return res.status(404).json({ error: "Department not found." });
  db.prepare("DELETE FROM departments WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
