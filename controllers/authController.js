const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

// Admin credentials from .env
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
async function login(req, res) {
  const { username, password } = req.body;

  const compare = await bcrypt.compare(password, ADMIN_PASSWORD);
  
  
  if (!username || !password) {
      return res
      .status(400)
      .json({ error: "សូមបញ្ចូលឈ្មោះអ្នកប្រើ និងលេខសម្ងាត់" });
    }

  // Compare credentials (plain text — swap for bcrypt if you store hashed passwords)
  if (username !== ADMIN_USERNAME || !compare) {
    return res
      .status(401)
      .json({ error: "ឈ្មោះអ្នកប្រើ ឬលេខសម្ងាត់មិនត្រឹមត្រូវ" });
  }

  // Sign JWT
  const token = jwt.sign({ username, role: "admin" }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  return res.json({
    message: "ចូលប្រព័ន្ធបានជោគជ័យ",
    token,
    admin: { username, role: "admin" },
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * POST /api/auth/logout
 * JWT is stateless — logout is handled client-side by deleting the token.
 * This endpoint is a courtesy confirmation.
 */
async function logout(req, res) {
  return res.json({ message: "ចេញពីប្រព័ន្ធបានជោគជ័យ" });
}

/**
 * GET /api/auth/me
 * Returns current admin info from token (requires authMiddleware).
 */
async function me(req, res) {
  return res.json({ admin: req.admin });
}

module.exports = { login, logout, me };
