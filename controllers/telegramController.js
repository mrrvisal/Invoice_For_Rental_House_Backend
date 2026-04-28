const axios = require("axios");
const db = require("../config/database");
const {
  calculatePaymentStatus,
  formatDateKH,
  formatCurrency,
  KH_MONTHS,
} = require("../utils/paymentUtils");
require("dotenv").config();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a visual progress bar  e.g.  ████░░░  5/8 ខែ */
function progressBar(paid, total, size = 8) {
  if (total === 0) return "░".repeat(size);
  const filled = Math.round((paid / total) * size);
  return "█".repeat(filled) + "░".repeat(size - filled);
}

// ─── Tenant data query ────────────────────────────────────────────────────────

async function getTenantData(id) {
  const [rows] = await db.query(
    `
    SELECT r.*,
      COALESCE(SUM(ph.months_paid), 0) AS total_months_paid,
      COALESCE(SUM(ph.amount_paid), 0) AS total_amount_paid
    FROM rental_records r
    LEFT JOIN payment_history ph ON r.id = ph.rental_id
    WHERE r.id = ?
    GROUP BY r.id
  `,
    [id],
  );

  if (!rows.length) return null;

  const t = rows[0];
  const { overdueMonths, currentMonthDue, totalMonths, nextDueDate, dueDay } =
    calculatePaymentStatus(t.checkin_date);
  const monthsPaid = parseInt(t.total_months_paid) || 0;
  const unpaidTotal = Math.max(0, totalMonths - monthsPaid);
  const unpaidOverdue = Math.max(
    0,
    overdueMonths - Math.min(monthsPaid, overdueMonths),
  );
  const unpaidCurrent = unpaidTotal > 0 ? currentMonthDue : 0;
  const price = parseFloat(t.room_price);

  return {
    ...t,
    price,
    overdueMonths,
    currentMonthDue,
    totalMonths,
    monthsPaid,
    unpaidTotal,
    unpaidOverdue,
    unpaidCurrent,
    overdueAmt: unpaidOverdue * price,
    currentAmt: unpaidCurrent * price,
    totalDue: unpaidTotal * price,
    nextDueDate,
    dueDay,
  };
}

// ─── Individual invoice ───────────────────────────────────────────────────────

function buildInvoiceMessage(t) {
  const now = new Date();
  const currentMonthName = KH_MONTHS[now.getMonth()];
  const bar = progressBar(t.monthsPaid, t.totalMonths);

  // Payment breakdown section
  let breakdownLines = "";
  if (t.unpaidOverdue > 0 && t.unpaidCurrent > 0) {
    breakdownLines =
      `┃ ⏰ ខែជំពាក់ចាស់\n` +
      `┃    ${t.unpaidOverdue} ខែ × ${formatCurrency(t.price)} = *${formatCurrency(t.overdueAmt)}*\n` +
      `┃\n` +
      `┃ 📆 ខែ${currentMonthName} (បច្ចុប្បន្ន)\n` +
      `┃    ${t.unpaidCurrent} ខែ × ${formatCurrency(t.price)} = *${formatCurrency(t.currentAmt)}*`;
  } else if (t.unpaidCurrent > 0) {
    breakdownLines =
      `┃ 📆 ខែ${currentMonthName} (បច្ចុប្បន្ន)\n` +
      `┃    ${t.unpaidCurrent} ខែ × ${formatCurrency(t.price)} = *${formatCurrency(t.currentAmt)}*`;
  } else {
    breakdownLines = `┃ ✅ បានបង់គ្រប់ហើយ`;
  }

  const totalMonthsLabel =
    t.unpaidOverdue > 0 && t.unpaidCurrent > 0
      ? `${t.unpaidOverdue} + ${t.unpaidCurrent} = ${t.unpaidTotal} ខែ`
      : `${t.unpaidTotal} ខែ`;

  return `
🏠 *វិក្កយបត្រជួលបន្ទប់*
━━━━━━━━━━━━━━━━━━━

👤 ${t.tenant_name}
🚪 បន្ទប់លេខ *${t.room_number}*  ·  📱 ${t.phone}
📅 ចូលស្នាក់: ${formatDateKH(t.checkin_date)}
📆 ថ្ងៃបង់: រៀងរាល់ *ថ្ងៃ ${t.dueDay}* នៃខែ

━━━━━━━━━━━━━━━━━━━
💳 *ការបង់ប្រាក់*

💰 តម្លៃ/ខែ: *${formatCurrency(t.price)}*
${bar}  ${t.monthsPaid}/${t.totalMonths} ខែ

━━━━━━━━━━━━━━━━━━━
📊 *សេចក្តីលម្អិត*

${breakdownLines}

━━━━━━━━━━━━━━━━━━━
💵 *សរុបត្រូវបង់*
┗▶ ${totalMonthsLabel} = *${formatCurrency(t.totalDue)}*
━━━━━━━━━━━━━━━━━━━
_⚠️ សូមមេត្តាបង់ប្រាក់ឱ្យបានទាន់ពេលវេលា_
_🙏 អរគុណសម្រាប់ការជឿទុកចិត្ត_
`.trim();
}

// ─── Summary report ───────────────────────────────────────────────────────────

function buildSummaryMessage(tenants, today) {
  const now = new Date();
  const currentMonthName = KH_MONTHS[now.getMonth()];
  const grandTotal = tenants.reduce((s, t) => s + t.totalDue, 0);

  const lines = tenants
    .map((t, i) => {
      const num = String(i + 1).padStart(2, "0");
      let detail = "";
      if (t.unpaidOverdue > 0 && t.unpaidCurrent > 0) {
        detail = `ចាស់ ${t.unpaidOverdue}ខែ + ខែ${currentMonthName} 1ខែ`;
      } else if (t.unpaidOverdue > 0) {
        detail = `ជំពាក់ ${t.unpaidOverdue} ខែ`;
      } else {
        detail = `ខែ${currentMonthName} ${t.unpaidCurrent} ខែ`;
      }

      return (
        `${num}\\. 🚪 *បន្ទប់ ${t.room_number}* — ${t.tenant_name}\n` +
        `      📱 ${t.phone}\n` +
        `      💰 ${formatCurrency(t.price)}/ខែ  ·  ${detail}\n` +
        `      ⟹  *${formatCurrency(t.totalDue)}*`
      );
    })
    .join("\n\n");

  return `
📋 *របាយការណ៍ប្រាក់ជំពាក់*
━━━━━━━━━━━━━━━━━━━
🗓 ថ្ងៃទី: *${today}*
🏠 អ្នកជំពាក់: *${tenants.length} នាក់*
━━━━━━━━━━━━━━━━━━━

${lines}

━━━━━━━━━━━━━━━━━━━
📦 *សរុប*
┣ អ្នកជំពាក់:  *${tenants.length} នាក់*
┗ ទឹកប្រាក់:  *${formatCurrency(grandTotal)}*
━━━━━━━━━━━━━━━━━━━
_📅 បានបង្កើតដោយស្វ័យប្រវត្តិ · ${today}_
`.trim();
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// POST /api/rentals/telegram/invoice/:id
exports.sendInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(400).json({
        success: false,
        message: "Telegram Bot Token ឬ Chat ID មិនបានដំឡើង",
      });
    }

    const t = await getTenantData(id);
    if (!t)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញទិន្នន័យ" });

    if (t.unpaidTotal === 0) {
      return res
        .status(400)
        .json({ success: false, message: "អ្នកជួលនេះបានបង់គ្រប់ហើយ" });
    }

    const message = buildInvoiceMessage(t);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "Markdown",
    });

    res.json({
      success: true,
      message: "បានផ្ញើវិក្កយបត្រទៅ Telegram ដោយជោគជ័យ",
    });
  } catch (err) {
    console.error("Telegram error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message:
        "មិនអាចផ្ញើ Telegram បាន: " +
        (err.response?.data?.description || err.message),
    });
  }
};

// POST /api/rentals/telegram/send-all
exports.sendAllUnpaidInvoices = async (req, res) => {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
      return res.status(400).json({
        success: false,
        message: "Telegram Bot Token ឬ Chat ID មិនបានដំឡើង",
      });
    }

    const [rows] = await db.query(`
      SELECT r.*,
        COALESCE(SUM(ph.months_paid), 0) AS total_months_paid
      FROM rental_records r
      LEFT JOIN payment_history ph ON r.id = ph.rental_id
      GROUP BY r.id
      ORDER BY r.room_number ASC
    `);

    const tenants = rows
      .map((t) => {
        const { overdueMonths, currentMonthDue, totalMonths, dueDay } =
          calculatePaymentStatus(t.checkin_date);
        const monthsPaid = parseInt(t.total_months_paid) || 0;
        const unpaidTotal = Math.max(0, totalMonths - monthsPaid);
        const unpaidOverdue = Math.max(
          0,
          overdueMonths - Math.min(monthsPaid, overdueMonths),
        );
        const unpaidCurrent = unpaidTotal > 0 ? currentMonthDue : 0;
        const price = parseFloat(t.room_price);
        return {
          ...t,
          price,
          overdueMonths,
          currentMonthDue,
          totalMonths,
          monthsPaid,
          unpaidTotal,
          unpaidOverdue,
          unpaidCurrent,
          totalDue: unpaidTotal * price,
          dueDay,
        };
      })
      .filter((t) => t.unpaidTotal > 0);

    if (!tenants.length) {
      return res.json({
        success: true,
        message: "មិនមានអ្នកជួលជំពាក់ប្រាក់ទេ 🎉",
      });
    }

    const today = formatDateKH(new Date().toISOString());
    const summaryMessage = buildSummaryMessage(tenants, today);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: summaryMessage,
      parse_mode: "Markdown",
    });

    res.json({
      success: true,
      message: `បានផ្ញើរបាយការណ៍អ្នកជំពាក់ ${tenants.length} នាក់ ទៅ Telegram`,
    });
  } catch (err) {
    console.error("Telegram error:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      message:
        "មិនអាចផ្ញើ Telegram បាន: " +
        (err.response?.data?.description || err.message),
    });
  }
};

module.exports.getTenantData = getTenantData;
module.exports.buildInvoiceMessage = buildInvoiceMessage;