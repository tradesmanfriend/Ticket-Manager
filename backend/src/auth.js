const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function signToken({ propertyId, staffId }) {
  return jwt.sign({ propertyId, staffId }, SECRET, { expiresIn: "30d" });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function checkPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

module.exports = { signToken, verifyToken, hashPassword, checkPassword };
