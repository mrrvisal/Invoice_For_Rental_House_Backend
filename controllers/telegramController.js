const axios = require("axios");
const db = require("../config/database");
const {
  calculatePaymentStatus,
  formatDateKH,
  formatCurrency,
  KH_MONTHS,
} = require("../utils/paymentUtils");
require("dotenv").config();

// Get enriched tenant data
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

// Build invoice message for one tenant
function buildInvoiceMessage(t) {
  const now = new Date();
  const currentMonthName = KH_MONTHS[now.getMonth()];

  let breakdownLines = "";

  if (t.unpaidOverdue > 0 && t.unpaidCurrent > 0) {
    breakdownLines = `
❌ *ជំពាក់ (ខែចុងក្រោយ):* ${t.unpaidOverdue} ខែ × ${formatCurrency(t.price)} = *${formatCurrency(t.overdueAmt)}*
🗓 *ខែ${currentMonthName}នេះ:* ${t.unpaidCurrent} ខែ × ${formatCurrency(t.price)} = *${formatCurrency(t.currentAmt)}*`;
  } else if (t.unpaidCurrent > 0) {
    breakdownLines = `
🗓 *ខែ${currentMonthName}នេះ:* ${t.unpaidCurrent} ខែ × ${formatCurrency(t.price)} = *${formatCurrency(t.currentAmt)}*`;
  } else {
    breakdownLines = `\n✅ *បង់គ្រប់ហើយ*`;
  }

  const totalLine =
    t.unpaidOverdue > 0 && t.unpaidCurrent > 0
      ? `${t.unpaidOverdue} + ${t.unpaidCurrent} = *${t.unpaidTotal} ខែ = ${formatCurrency(t.totalDue)}*`
      : `*${t.unpaidTotal} ខែ = ${formatCurrency(t.totalDue)}*`;

  return `
🏠 *វិក្កយបត្រជួលបន្ទប់*
━━━━━━━━━━━━━━━━━
👤 *អ្នកជួល:* ${t.tenant_name}
📱 *ទូរស័ព្ទ:* ${t.phone}
🚪 *បន្ទប់:* ${t.room_number}
📅 *ថ្ងៃចូលស្នាក់:* ${formatDateKH(t.checkin_date)}
📆 *ថ្ងៃត្រូវបង់:* រៀងរាល់ ថ្ងៃ ${t.dueDay} នៃខែ
━━━━━━━━━━━━━━━━━
💰 *តម្លៃ/ខែ:* ${formatCurrency(t.price)}
✅ *បានបង់រួចហើយ:* ${t.monthsPaid} ខែ
━━━━━━━━━━━━━━━━━
${breakdownLines}
━━━━━━━━━━━━━━━━━
💵 *សរុបត្រូវបង់:* ${totalLine}
━━━━━━━━━━━━━━━━━
⚠️ _សូមមេត្តាបង់ប្រាក់ឱ្យបានទាន់ខែ_
`.trim();
}

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
// FIX: chat_id is now only read from env — callers cannot redirect invoices to another chat
exports.sendAllUnpaidInvoices = async (req, res) => {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHAT_ID; // ✅ env only — not req.body

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

    const now = new Date();
    const currentMonthName = KH_MONTHS[now.getMonth()];

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

    const grandTotal = tenants.reduce((s, t) => s + t.totalDue, 0);
    const today = formatDateKH(new Date().toISOString());

    const lines = tenants
      .map((t, i) => {
        let detail = "";
        if (t.unpaidOverdue > 0 && t.unpaidCurrent > 0) {
          detail = `ជំពាក់ ${t.unpaidOverdue}ខែ + ខែ${currentMonthName} 1ខែ = ${t.unpaidTotal}ខែ`;
        } else {
          detail = `ខែ${currentMonthName} ${t.unpaidTotal}ខែ`;
        }
        return `${i + 1}. 🚪 *${t.room_number}* — ${t.tenant_name}\n   📱 ${t.phone}\n   💰 ${formatCurrency(t.price)}/ខែ | ${detail}\n   ⟹ *${formatCurrency(t.totalDue)}*`;
      })
      .join("\n\n");

    const summaryMessage = `
📋 *របាយការណ៍ប្រាក់ជំពាក់*
📅 *ថ្ងៃទី:* ${today}
━━━━━━━━━━━━━━━━━

${lines}

━━━━━━━━━━━━━━━━━
🏠 *អ្នកជំពាក់សរុប:* ${tenants.length} នាក់
💰 *ទឹកប្រាក់ជំពាក់សរុប:* *${formatCurrency(grandTotal)}*
    `.trim();

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
