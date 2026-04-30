const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const axios = require("axios");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
require("dotenv").config();
const { startScheduler } = require("./services/schedulerService");
const authMiddleware = require("./middleware/auth"); // ✅ Auth middleware

const app = express();
PORT = process.env.PORT || 4001;

const allowedOrigins = [
  "http://localhost:5173",
  "https://invoice-for-rental-house-backend.onrender.com",
  "https://invoice-for-rental-house.onrender.com",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Auth routes (public — no middleware)
app.use("/api/auth", require("./routes/auth"));

// ✅ Rental routes — protected by JWT
app.use("/api/rentals", authMiddleware, require("./routes/rental"));

// Health check (public)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date(),
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = app;
