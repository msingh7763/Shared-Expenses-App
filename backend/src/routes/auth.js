const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// POST /api/auth/register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('username').isLength({ min: 3, max: 30 }).trim().withMessage('Username must be 3–30 characters'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('displayName').notEmpty().trim().withMessage('Display name is required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, username, password, displayName } = req.body;
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { email, username, passwordHash, displayName },
        select: { id: true, email: true, username: true, displayName: true, createdAt: true },
      });
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
      res.status(201).json({ success: true, data: { user, token } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
      res.json({
        success: true,
        data: {
          token,
          user: { id: user.id, email: user.email, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, username: true, displayName: true, avatarUrl: true, createdAt: true },
    });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/auth/me
router.patch(
  '/me',
  authMiddleware,
  [
    body('displayName').optional().notEmpty().trim(),
    body('avatarUrl').optional().isURL().withMessage('Invalid URL for avatar'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { displayName, avatarUrl } = req.body;
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { ...(displayName && { displayName }), ...(avatarUrl !== undefined && { avatarUrl }) },
        select: { id: true, email: true, username: true, displayName: true, avatarUrl: true },
      });
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
