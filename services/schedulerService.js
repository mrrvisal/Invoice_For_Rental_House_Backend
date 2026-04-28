const cron = require("node-cron");
const db = require("../config/database");
const axios = require("axios");
const {
  calculatePaymentStatus,
  formatDateKH,
} = require("../utils/paymentUtils");
const {
  getTenantData,
  buildInvoiceMessage,
} = require("../controllers/telegramController");
require("dotenv").config();

async function sendToTelegram(text) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text,
    parse_mode: "Markdown",
  });
}

// Alert owner on scheduler error
async function sendErrorAlert(context, message) {
  try {
    await sendToTelegram(
      `⚠️ *[Scheduler Error]*\n📌 ${context}\n❌ ${message}`,
    );
  } catch (e) {
    console.error("[Scheduler] Failed to send error alert:", e.message);
  }
}

// Send invoice for one tenant
async function sendInvoiceForTenant(row) {
  const t = await getTenantData(row.id);
  if (!t || t.unpaidTotal === 0) return;
  const msg = buildInvoiceMessage(t);
  await sendToTelegram(msg);
}

// ====== AUTO SCHEDULER — due date today ======
async function checkAndNotifyDueToday() {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    if (!BOT_TOKEN || !CHAT_ID) {
      console.error("[Scheduler] Token/Chat ID missing");
      return;
    }

    const today = new Date();
    const todayDay = today.getDate();

    const [rows] = await db.query(`
      SELECT r.*, COALESCE(SUM(ph.months_paid), 0) AS total_months_paid
      FROM rental_records r
      LEFT JOIN payment_history ph ON r.id = ph.rental_id
      GROUP BY r.id
    `);

    // Filter: due_day = today AND past checkin date
    const dueTenants = rows.filter((row) => {
      const checkin = new Date(row.checkin_date);
      const dueDay = checkin.getDate();
      const thisDue = new Date(today.getFullYear(), today.getMonth(), dueDay);
      return dueDay === todayDay && thisDue > checkin;
    });

    if (!dueTenants.length) {
      console.log("[Scheduler] មិនមាន due ថ្ងៃនេះ");
      return;
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const row of dueTenants) {
      try {
        await sendInvoiceForTenant(row);
        sentCount++;
        console.log(
          `[Scheduler] ✓ ផ្ញើ: ${row.tenant_name} (បន្ទប់ ${row.room_number})`,
        );
        // Delay between messages to avoid Telegram rate limit
        await new Promise((r) => setTimeout(r, 500));
      } catch (e) {
        failedCount++;
        console.error(`[Scheduler] ✗ ${row.tenant_name}:`, e.message);
      }
    }

    console.log(
      `[Scheduler] ✓ សរុប ${sentCount} នាក់${failedCount > 0 ? ` (ខកខាន ${failedCount} នាក់)` : ""}`,
    );

    // Alert if any failed
    if (failedCount > 0) {
      await sendErrorAlert(
        "checkAndNotifyDueToday",
        `ផ្ញើបានតែ ${sentCount}/${dueTenants.length} នាក់`,
      );
    }
  } catch (err) {
    console.error("[Scheduler] Error:", err.response?.data || err.message);
    await sendErrorAlert(
      "checkAndNotifyDueToday",
      err.response?.data?.description || err.message,
    );
  }
}

// ====== TEST — send invoice for specific or first 3 tenants ======
async function testNotifyNow(tenantId = null) {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    if (!BOT_TOKEN || !CHAT_ID) return { ok: false, message: "Token missing" };

    let rows;
    if (tenantId) {
      [rows] = await db.query(
        `
        SELECT r.*, COALESCE(SUM(ph.months_paid), 0) AS total_months_paid
        FROM rental_records r
        LEFT JOIN payment_history ph ON r.id = ph.rental_id
        WHERE r.id = ? GROUP BY r.id
      `,
        [tenantId],
      );
    } else {
      [rows] = await db.query(`
        SELECT r.*, COALESCE(SUM(ph.months_paid), 0) AS total_months_paid
        FROM rental_records r
        LEFT JOIN payment_history ph ON r.id = ph.rental_id
        GROUP BY r.id LIMIT 3
      `);
    }

    if (!rows.length) return { ok: false, message: "រកមិនឃើញទិន្នន័យ" };

    let sentCount = 0;
    for (const row of rows) {
      const t = await getTenantData(row.id);
      if (!t) continue;

      const originalMsg = buildInvoiceMessage(t);
      const testMsg = `🧪 *[TEST MODE]*\n⚠️ _នេះជា test — មិនមែន due date ពិតទេ_\n━━━━━━━━━━━━━━━━━\n${originalMsg}`;

      await sendToTelegram(testMsg);
      sentCount++;
      await new Promise((r) => setTimeout(r, 500));
    }

    return {
      ok: true,
      message: `ផ្ញើ test invoice ដោយជោគជ័យ ${sentCount} នាក់`,
    };
  } catch (err) {
    console.error("[TEST] Error:", err.response?.data || err.message);
    return { ok: false, message: err.message };
  }
}

function startScheduler() {
  cron.schedule("0 12 * * *", checkAndNotifyDueToday, {
    timezone: "Asia/Phnom_Penh",
  });
  console.log("[Scheduler] ✓ cron 12:00pm រៀងរាល់ថ្ងៃ");
}

module.exports = { startScheduler, checkAndNotifyDueToday, testNotifyNow };
