const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware: verify JWT token from Authorization header.
 * Usage: router.get("/protected", authMiddleware, handler)
 */
function authMiddleware(req, res, next) {
    
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "គ្មាន Token — សូមចូលប្រព័ន្ធជាមុន" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded; // attach admin info to request
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token មិនត្រឹមត្រូវ ឬផុតកំណត់" });
  }
}

module.exports = authMiddleware;
