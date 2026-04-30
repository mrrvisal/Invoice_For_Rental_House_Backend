const express = require("express");
const router = express.Router();
const { login, logout, me } = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

// Public routes
router.post("/login", login);

// Protected routes (require valid JWT)
router.post("/logout", authMiddleware, logout);
router.get("/me", authMiddleware, me);

module.exports = router;