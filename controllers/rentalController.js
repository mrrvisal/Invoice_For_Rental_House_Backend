const db = require("../config/database");
const { calculatePaymentStatus } = require("../utils/paymentUtils");

// ===== TEST MODE (non-production only) =====
let testOffsetMonths = 0;

exports.setTestOffset = (req, res) => {
  testOffsetMonths = parseInt(req.body.months) || 0;
  res.json({ ok: true, offsetMonths: testOffsetMonths });
};

function getOffset() {
  return process.env.NODE_ENV === "production" ? 0 : testOffsetMonths;
}
// ============================================

// GET all records
exports.getAllRecords = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*,
        COALESCE(SUM(ph.months_paid), 0) AS total_months_paid,
        COALESCE(SUM(ph.amount_paid), 0) AS total_amount_paid
      FROM rental_records r
      LEFT JOIN payment_history ph ON r.id = ph.rental_id
      GROUP BY r.id
      ORDER BY r.room_number ASC
    `);

    const data = rows.map((row) => {
      const {
        overdueMonths,
        currentMonthDue,
        totalMonths,
        nextDueDate,
        dueDay,
      } = calculatePaymentStatus(row.checkin_date, getOffset());
      const monthsPaid = parseInt(row.total_months_paid) || 0;
      const unpaidMonths = Math.max(0, totalMonths - monthsPaid);
      const unpaidOverdue = Math.max(
        0,
        overdueMonths - Math.min(monthsPaid, overdueMonths),
      );
      const unpaidCurrent = unpaidMonths > 0 ? currentMonthDue : 0;
      const price = parseFloat(row.room_price);
      const totalDue = unpaidMonths * price;

      return {
        ...row,
        months_count: totalMonths,
        months_paid: monthsPaid,
        overdue_months: overdueMonths,
        unpaid_overdue_months: unpaidOverdue,
        unpaid_current_month: unpaidCurrent,
        unpaid_months: unpaidMonths,
        total_due: totalDue,
        next_due_date: nextDueDate,
        due_day: dueDay,
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single record
exports.getRecord = async (req, res) => {
  try {
    const { id } = req.params;
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

    if (!rows.length)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញទិន្នន័យ" });

    const row = rows[0];
    const { overdueMonths, currentMonthDue, totalMonths, nextDueDate, dueDay } =
      calculatePaymentStatus(row.checkin_date, getOffset());
    const monthsPaid = parseInt(row.total_months_paid) || 0;
    const unpaidMonths = Math.max(0, totalMonths - monthsPaid);

    res.json({
      success: true,
      data: {
        ...row,
        months_count: totalMonths,
        months_paid: monthsPaid,
        overdue_months: overdueMonths,
        unpaid_months: unpaidMonths,
        total_due: unpaidMonths * parseFloat(row.room_price),
        next_due_date: nextDueDate,
        due_day: dueDay,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST create record
exports.createRecord = async (req, res) => {
  try {
    const { tenant_name, phone, room_number, room_price, checkin_date, notes } =
      req.body;

    if (
      !tenant_name ||
      !phone ||
      !room_number ||
      !room_price ||
      !checkin_date
    ) {
      return res
        .status(400)
        .json({ success: false, message: "សូមបំពេញព័ត៌មានទាំងអស់" });
    }

    // Sanitize string inputs
    const sanitized = {
      tenant_name: String(tenant_name).trim().slice(0, 255),
      phone: String(phone).trim().slice(0, 50),
      room_number: String(room_number).trim().slice(0, 50),
      room_price: parseFloat(room_price),
      checkin_date: String(checkin_date).trim(),
      notes: notes ? String(notes).trim().slice(0, 1000) : null,
    };

    if (isNaN(sanitized.room_price) || sanitized.room_price <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "តម្លៃបន្ទប់មិនត្រឹមត្រូវ" });
    }

    // Check duplicate room
    const [existing] = await db.query(
      "SELECT id FROM rental_records WHERE room_number = ?",
      [sanitized.room_number],
    );
    if (existing.length) {
      return res.status(400).json({
        success: false,
        message: `បន្ទប់លេខ ${sanitized.room_number} មានអ្នកជួលរួចហើយ`,
      });
    }

    const { totalMonths } = calculatePaymentStatus(
      sanitized.checkin_date,
      getOffset(),
    );
    const totalDue = totalMonths * sanitized.room_price;

    const [result] = await db.query(
      `INSERT INTO rental_records (tenant_name, phone, room_number, room_price, checkin_date, months_count, total_due, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)`,
      [
        sanitized.tenant_name,
        sanitized.phone,
        sanitized.room_number,
        sanitized.room_price,
        sanitized.checkin_date,
        totalMonths,
        totalDue,
        sanitized.notes,
      ],
    );

    res.json({
      success: true,
      message: "បានបន្ថែមទិន្នន័យដោយជោគជ័យ",
      id: result.insertId,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT update record
exports.updateRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_name, phone, room_number, room_price, checkin_date, notes } =
      req.body;

    const [rows] = await db.query(
      "SELECT id FROM rental_records WHERE id = ?",
      [id],
    );
    if (!rows.length)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញទិន្នន័យ" });

    // Sanitize string inputs
    const sanitized = {
      tenant_name: String(tenant_name).trim().slice(0, 255),
      phone: String(phone).trim().slice(0, 50),
      room_number: String(room_number).trim().slice(0, 50),
      room_price: parseFloat(room_price),
      checkin_date: String(checkin_date).trim(),
      notes: notes ? String(notes).trim().slice(0, 1000) : null,
    };

    // Check duplicate room (exclude self)
    const [dup] = await db.query(
      "SELECT id FROM rental_records WHERE room_number = ? AND id != ?",
      [sanitized.room_number, id],
    );
    if (dup.length) {
      return res.status(400).json({
        success: false,
        message: `បន្ទប់លេខ ${sanitized.room_number} មានអ្នកជួលផ្សេងរួចហើយ`,
      });
    }

    const { totalMonths } = calculatePaymentStatus(
      sanitized.checkin_date,
      getOffset(),
    );

    await db.query(
      `UPDATE rental_records
       SET tenant_name=?, phone=?, room_number=?, room_price=?, checkin_date=?, months_count=?, notes=?, updated_at=NOW()
       WHERE id=?`,
      [
        sanitized.tenant_name,
        sanitized.phone,
        sanitized.room_number,
        sanitized.room_price,
        sanitized.checkin_date,
        totalMonths,
        sanitized.notes,
        id,
      ],
    );

    res.json({ success: true, message: "បានកែប្រែទិន្នន័យដោយជោគជ័យ" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH update payment status (supports partial payment)
exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { months_to_pay } = req.body;

    const [rows] = await db.query(
      `
      SELECT r.*,
        COALESCE(SUM(ph.months_paid), 0) AS total_months_paid
      FROM rental_records r
      LEFT JOIN payment_history ph ON r.id = ph.rental_id
      WHERE r.id = ?
      GROUP BY r.id
    `,
      [id],
    );

    if (!rows.length)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញទិន្នន័យ" });

    const row = rows[0];
    const { overdueMonths, currentMonthDue, totalMonths } =
      calculatePaymentStatus(row.checkin_date, getOffset());
    const monthsPaid = parseInt(row.total_months_paid) || 0;
    const unpaidMonths = Math.max(0, totalMonths - monthsPaid);

    if (unpaidMonths === 0) {
      return res
        .status(400)
        .json({ success: false, message: "មិនមានខែជំពាក់ទេ" });
    }

    const paying = months_to_pay
      ? Math.min(parseInt(months_to_pay), unpaidMonths)
      : unpaidMonths;
    const amountPaid = paying * parseFloat(row.room_price);
    const remainingAfter = unpaidMonths - paying;

    await db.query(
      `INSERT INTO payment_history (rental_id, months_paid, amount_paid, paid_date)
       VALUES (?, ?, ?, CURDATE())`,
      [id, paying, amountPaid],
    );

    const newStatus = remainingAfter === 0 ? "paid" : "unpaid";
    await db.query(
      `UPDATE rental_records SET status=?, last_paid_date=CURDATE(), updated_at=NOW() WHERE id=?`,
      [newStatus, id],
    );

    res.json({
      success: true,
      message: `បានបញ្ចូលការបង់ប្រាក់ ${paying} ខែ ($${amountPaid.toLocaleString()})${
        remainingAfter > 0
          ? ` — នៅជំពាក់ ${remainingAfter} ខែទៀត`
          : " — បង់គ្រប់ហើយ"
      }`,
      months_paid: paying,
      amount_paid: amountPaid,
      remaining_months: remainingAfter,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE record
exports.deleteRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      "SELECT id FROM rental_records WHERE id = ?",
      [id],
    );
    if (!rows.length)
      return res
        .status(404)
        .json({ success: false, message: "រកមិនឃើញទិន្នន័យ" });

    await db.query("DELETE FROM rental_records WHERE id = ?", [id]);
    res.json({ success: true, message: "បានលុបទិន្នន័យដោយជោគជ័យ" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET payment history
exports.getPaymentHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      "SELECT * FROM payment_history WHERE rental_id = ? ORDER BY paid_date DESC",
      [id],
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
