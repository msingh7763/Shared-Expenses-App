const express = require('express');
const { body, param } = require('express-validator');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();
router.use(authMiddleware);

// GET /api/groups — list all groups for current user
router.get('/', async (req, res, next) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user.id },
      include: {
        group: {
          include: {
            members: {
              include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
            },
            _count: { select: { expenses: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    const groups = memberships.map((m) => ({
      ...m.group,
      myMembership: { joinedAt: m.joinedAt, leftAt: m.leftAt, role: m.role },
    }));
    res.json({ success: true, data: groups });
  } catch (err) {
    next(err);
  }
});

// POST /api/groups — create group
router.post(
  '/',
  [
    body('name').notEmpty().trim().withMessage('Group name required'),
    body('description').optional().trim(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, description } = req.body;
      const group = await prisma.group.create({
        data: {
          name,
          description,
          createdById: req.user.id,
          members: {
            create: { userId: req.user.id, role: 'admin', joinedAt: new Date() },
          },
        },
        include: { members: { include: { user: { select: { id: true, displayName: true, username: true } } } } },
      });
      res.status(201).json({ success: true, data: group });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/groups/:id
router.get('/:id', param('id').isUUID(), validate, async (req, res, next) => {
  try {
    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { expenses: true, settlements: true } },
      },
    });
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });

    // Check membership
    const isMember = group.members.some((m) => m.userId === req.user.id);
    if (!isMember) return res.status(403).json({ success: false, error: 'Not a member of this group' });

    res.json({ success: true, data: group });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/groups/:id
router.patch(
  '/:id',
  param('id').isUUID(),
  [body('name').optional().notEmpty().trim(), body('description').optional().trim()],
  validate,
  async (req, res, next) => {
    try {
      const { name, description } = req.body;
      await requireAdmin(req.params.id, req.user.id, res);
      const group = await prisma.group.update({
        where: { id: req.params.id },
        data: { ...(name && { name }), ...(description !== undefined && { description }) },
      });
      res.json({ success: true, data: group });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/groups/:id
router.delete('/:id', param('id').isUUID(), validate, async (req, res, next) => {
  try {
    const isAdmin = await requireAdmin(req.params.id, req.user.id, res);
    if (!isAdmin) return;
    await prisma.group.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { message: 'Group deleted' } });
  } catch (err) {
    next(err);
  }
});

// POST /api/groups/:id/members — add member
router.post(
  '/:id/members',
  param('id').isUUID(),
  [
    body('userId').isUUID().withMessage('Valid userId required'),
    body('joinedAt').optional().isISO8601().withMessage('joinedAt must be a valid date'),
    body('role').optional().isIn(['admin', 'member']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { userId, joinedAt, role } = req.body;
      const groupId = req.params.id;

      // Check current user is admin or member
      const myMembership = await prisma.groupMember.findFirst({
        where: { groupId, userId: req.user.id, leftAt: null },
      });
      if (!myMembership) return res.status(403).json({ success: false, error: 'Not a member of this group' });

      // Check if target user already active
      const existing = await prisma.groupMember.findFirst({
        where: { groupId, userId, leftAt: null },
      });
      if (existing) return res.status(409).json({ success: false, error: 'User is already an active member' });

      const member = await prisma.groupMember.create({
        data: {
          groupId,
          userId,
          role: role || 'member',
          joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
        },
        include: { user: { select: { id: true, displayName: true, username: true } } },
      });
      res.status(201).json({ success: true, data: member });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/groups/:id/members/:userId — update membership (e.g. set leftAt)
router.patch(
  '/:id/members/:userId',
  [param('id').isUUID(), param('userId').isUUID()],
  [body('leftAt').optional().isISO8601(), body('role').optional().isIn(['admin', 'member'])],
  validate,
  async (req, res, next) => {
    try {
      const { leftAt, role } = req.body;
      const groupId = req.params.id;
      const targetUserId = req.params.userId;

      const myMembership = await prisma.groupMember.findFirst({
        where: { groupId, userId: req.user.id, leftAt: null },
      });
      if (!myMembership) return res.status(403).json({ success: false, error: 'Not a member of this group' });

      const membership = await prisma.groupMember.findFirst({
        where: { groupId, userId: targetUserId, leftAt: null },
      });
      if (!membership) return res.status(404).json({ success: false, error: 'Active membership not found' });

      const updated = await prisma.groupMember.update({
        where: { id: membership.id },
        data: {
          ...(leftAt !== undefined && { leftAt: leftAt ? new Date(leftAt) : null }),
          ...(role && { role }),
        },
        include: { user: { select: { id: true, displayName: true, username: true } } },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/groups/:id/members/:userId — remove member (sets leftAt = now)
router.delete(
  '/:id/members/:userId',
  [param('id').isUUID(), param('userId').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const groupId = req.params.id;
      const targetUserId = req.params.userId;

      const myMembership = await prisma.groupMember.findFirst({
        where: { groupId, userId: req.user.id, leftAt: null },
      });
      if (!myMembership) return res.status(403).json({ success: false, error: 'Not a member of this group' });

      const membership = await prisma.groupMember.findFirst({
        where: { groupId, userId: targetUserId, leftAt: null },
      });
      if (!membership) return res.status(404).json({ success: false, error: 'Active membership not found' });

      const updated = await prisma.groupMember.update({
        where: { id: membership.id },
        data: { leftAt: new Date() },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/groups/:id/members/history — full membership history
router.get('/:id/members/history', param('id').isUUID(), validate, async (req, res, next) => {
  try {
    const members = await prisma.groupMember.findMany({
      where: { groupId: req.params.id },
      include: { user: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
      orderBy: [{ userId: 'asc' }, { joinedAt: 'asc' }],
    });
    res.json({ success: true, data: members });
  } catch (err) {
    next(err);
  }
});

// Helper
async function requireAdmin(groupId, userId, res) {
  const m = await prisma.groupMember.findFirst({ where: { groupId, userId, role: 'admin', leftAt: null } });
  if (!m) {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return false;
  }
  return true;
}

module.exports = router;
