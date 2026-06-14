const express = require('express');
const { param } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');
const { computeGroupBalances, computeUserBalances } = require('../services/balanceService');

const router = express.Router();
router.use(authMiddleware);

// GET /api/groups/:groupId/balances — full group balance breakdown
router.get(
  '/groups/:groupId/balances',
  param('groupId').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const result = await computeGroupBalances(req.params.groupId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/users/me/balances — all groups balance summary for current user
router.get('/users/me/balances', async (req, res, next) => {
  try {
    const result = await computeUserBalances(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
