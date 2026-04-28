const express = require("express");
const router = express.Router();
const rental = require("../controllers/rentalController");
const telegram = require("../controllers/telegramController");

// routes/rental.js ឬ routes/telegram.js
const { checkAndNotifyDueToday } = require('../services/schedulerService');
router.post('/test/notify-due', async (req, res) => {
  await checkAndNotifyDueToday();
  res.json({ ok: true, message: 'ផ្ញើរួច' });
});
// routes/telegram.js ឬ routes/rental.js
const { testNotifyNow } = require('../services/schedulerService');
// router — test 10s auto send (ផ្ញើ 1 ដង បន្ទាប់ 10s)
router.post('/test/notify-10s', async (req, res) => {
  res.json({ ok: true, message: 'នឹងផ្ញើក្នុង 10 វិនាទី...' });
  setTimeout(async () => {
    await testNotifyNow();
  }, 1000); // 10s
});

// routes/rental.js
const { setTestOffset } = require('../controllers/rentalController');
router.post('/test/set-offset', setTestOffset);

// Rental CRUD
router.get("/records", rental.getAllRecords);
router.get("/records/:id", rental.getRecord);
router.post("/records", rental.createRecord);
router.put("/records/:id", rental.updateRecord);
router.patch("/records/:id/status", rental.updateStatus);
router.delete("/records/:id", rental.deleteRecord);

// Payment history
router.get("/records/:id/history", rental.getPaymentHistory);

// Telegram
router.post("/telegram/invoice/:id", telegram.sendInvoice);
router.post("/telegram/send-all", telegram.sendAllUnpaidInvoices);

module.exports = router;
