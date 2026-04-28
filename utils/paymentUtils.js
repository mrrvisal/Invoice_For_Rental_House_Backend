/**
 * Shared payment calculation utility.
 * Single source of truth — used by rentalController and telegramController.
 */

/**
 * Calculate payment status based on checkin date.
 * - Due day = same day-of-month as checkin (e.g. checkin on 5th → due every 5th)
 * - overdueMonths = full months already past due date (not counting current month)
 * - currentMonthDue = always 1 (the ongoing month)
 * - totalMonths = overdueMonths + 1
 */
function calculatePaymentStatus(checkinDate, offsetMonths = 0) {
  const checkin = new Date(checkinDate);
  let now = new Date();

  if (offsetMonths !== 0) {
    now.setMonth(now.getMonth() + offsetMonths);
  }

  const dueDay = checkin.getDate();

  // Next due date (this month or next)
  let nextDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (nextDue <= now) {
    nextDue = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
  }

  // Last due date (most recent past due)
  let lastDue = new Date(now.getFullYear(), now.getMonth(), dueDay);
  if (lastDue > now) {
    lastDue = new Date(now.getFullYear(), now.getMonth() - 1, dueDay);
  }

  // Count full overdue months since checkin
  let overdueMonths = 0;
  const cursor = new Date(checkin.getFullYear(), checkin.getMonth(), dueDay);
  cursor.setMonth(cursor.getMonth() + 1); // first due date after checkin

  while (cursor <= lastDue) {
    overdueMonths++;
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return {
    overdueMonths,
    currentMonthDue: 1,
    totalMonths: overdueMonths + 1,
    nextDueDate: nextDue.toISOString().split("T")[0],
    dueDay,
  };
}

function formatDateKH(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()}`;
}

function formatCurrency(amount) {
  return `$${parseFloat(amount).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

const KH_MONTHS = [
  "មករា",
  "កុម្ភៈ",
  "មីនា",
  "មេសា",
  "ឧសភា",
  "មិថុនា",
  "កក្កដា",
  "សីហា",
  "កញ្ញា",
  "តុលា",
  "វិច្ឆិកា",
  "ធ្នូ",
];

module.exports = {
  calculatePaymentStatus,
  formatDateKH,
  formatCurrency,
  KH_MONTHS,
};
