require("dotenv").config();
const express = require("express");
const cors = require("cors");

const propertiesRouter = require("./routes/properties");
const authRouter = require("./routes/auth");
const propertyRouter = require("./routes/property");
const staffRouter = require("./routes/staff");
const departmentsRouter = require("./routes/departments");
const ticketsRouter = require("./routes/tickets");

const app = express();

const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",").map((s) => s.trim())
  : "*";

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/properties", propertiesRouter);
app.use("/api/auth", authRouter);
app.use("/api/property", propertyRouter);
app.use("/api/staff", staffRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/tickets", ticketsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Ticket board API listening on port ${PORT}`);
  if (!process.env.JWT_SECRET) {
    console.warn(
      "WARNING: JWT_SECRET is not set. Set a long random value in your environment before deploying — see .env.example."
    );
  }
});
