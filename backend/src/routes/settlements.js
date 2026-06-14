const express = require('express');
const { body, param } = require('express-validator');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');
const { convertToINR } = require('../services/currencyService');

const router = express.Router();
router.use(authMiddleware);

// POST /api/groups/:groupId/settlements
router.post(
  '/groups/:groupId/settlements',
  param('groupId').isUUID(),
  [
    body('fromUserId').isUUID().withMessage('fromUserId required'),
    body('toUserId').isUUID().withMessage('toUserId required'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
    body('currency').isIn(['INR', 'USD']).withMessage('Currency must be INR or USD'),
    body('settledAt').isISO8601().withMessage('settledAt must be a valid date'),
    body('notes').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const groupId = req.params.groupId;
      const { fromUserId, toUserId, amount, currency, settledAt, notes } = req.body;

      if (fromUserId === toUserId) {
        return res.status(400).json({ success: false, error: 'from and to user cannot be the same' });
      }

      // Verify both users are members
      const [fromMember, toMember] = await Promise.all([
        prisma.groupMember.findFirst({ where: { groupId, userId: fromUserId } }),
        prisma.groupMember.findFirst({ where: { groupId, userId: toUserId } }),
      ]);
      if (!fromMember) return res.status(400).json({ success: false, error: 'fromUser is not a group member' });
      if (!toMember) return res.status(400).json({ success: false, error: 'toUser is not a group member' });

      const { amountInr, conversionRate } = convertToINR(parseFloat(amount), currency);

      const settlement = await prisma.settlement.create({
        data: {
          groupId,
          fromUserId,
          toUserId,
          amount: parseFloat(amount),
          currency,
          amountInr,
          settledAt: new Date(settledAt),
          notes: notes || null,
        },
        include: {
          fromUser: { select: { id: true, displayName: true } },
          toUser: { select: { id: true, displayName: true } },
        },
      });

      res.status(201).json({ success: true, data: settlement });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/groups/:groupId/settlements
router.get(
  '/groups/:groupId/settlements',
  param('groupId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const settlements = await prisma.settlement.findMany({
        where: { groupId: req.params.groupId },
        include: {
          fromUser: { select: { id: true, displayName: true, avatarUrl: true } },
          toUser: { select: { id: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { settledAt: 'desc' },
      });
      res.json({ success: true, data: settlements });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/settlements/:id
router.delete('/settlements/:id', param('id').isUUID(), validate, async (req, res, next) => {
  try {
    const settlement = await prisma.settlement.findUnique({ where: { id: req.params.id } });
    if (!settlement) return res.status(404).json({ success: false, error: 'Settlement not found' });
    await prisma.settlement.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { message: 'Settlement deleted' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
