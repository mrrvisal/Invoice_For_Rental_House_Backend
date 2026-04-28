const express = require("express");
const router = express.Router();
const rental = require("../controllers/rentalController");
const telegram = require("../controllers/telegramController");

// ===== TEST ROUTES — non-production only =====
// These are disabled in production to prevent abuse
if (process.env.NODE_ENV !== "production") {
  const { testNotifyNow } = require("../services/schedulerService");
  const { setTestOffset } = require("../controllers/rentalController");

  router.post("/test/set-offset", setTestOffset);

  router.post("/test/notify-10s", async (req, res) => {
    res.json({ ok: true, message: "នឹងផ្ញើក្នុង 10 វិនាទី..." });
    setTimeout(async () => {
      await testNotifyNow();
    }, 10000);
  });
}
// =============================================

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
