const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();
const { startScheduler } = require("./services/schedulerService");

const app = express();
const PORT = 4000;

// Middleware
// app.use(cors({
//   origin: ['http://localhost:5173', 'http://localhost:8080', 'http://localhost:3001', 'http://localhost:4000'],
//   credentials: true
// }));
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
