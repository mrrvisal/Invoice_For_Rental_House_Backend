const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();
const { startScheduler } = require("./services/schedulerService");

const app = express();
PORT = process.env.PORT || 4001;

const allowedOrigins = [
  "http://localhost:5173",
  "https://invoice-for-rental-house-backend.onrender.com",
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

// Routes
app.use('/api/rentals', require('./routes/rental'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running', timestamp: new Date() });
});

// Auto-send daily unpaid report at 8AM (optional cron)
// Uncomment to enable automatic daily Telegram notifications
/*
cron.schedule('0 8 * * *', async () => {
  console.log('Running daily unpaid report...');
  try {
    const db = require('./config/database');
    // Add auto-send logic here if needed
  } catch (err) {
    console.error('Cron error:', err);
  }
}, { timezone: 'Asia/Phnom_Penh' });
*/

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 API: http://localhost:${PORT}/api/rentals`);
    startScheduler(); // ✅ ចាប់ cron
});

module.exports = app;
