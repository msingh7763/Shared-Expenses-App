const express = require('express');
const multer = require('multer');
const { param, body } = require('express-validator');
const prisma = require('../config/database');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');
const { stageImport, applyImport } = require('../services/importService');
const logger = require('../config/logger');

const router = express.Router();
router.use(authMiddleware);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

// POST /api/import/upload?groupId=xxx
// Stage import: parse CSV, detect anomalies — does NOT commit any data
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'CSV file required' });
    const groupId = req.query.groupId || req.body.groupId;
    if (!groupId) return res.status(400).json({ success: false, error: 'groupId required' });

    const result = await stageImport(groupId, req.file.originalname, req.file.buffer);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    logger.error(`Import upload error: ${err.message}`);
    next(err);
  }
});

// GET /api/import/:jobId — get import job status + anomalies
router.get('/:jobId', param('jobId').isUUID(), validate, async (req, res, next) => {
  try {
    const job = await prisma.importJob.findUnique({
      where: { id: req.params.jobId },
      include: {
        anomalies: { orderBy: [{ severity: 'asc' }, { rowNumber: 'asc' }] },
      },
    });
    if (!job) return res.status(404).json({ success: false, error: 'Import job not found' });
    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/import/:jobId/anomalies/:anomalyId — resolve an anomaly
router.patch(
  '/:jobId/anomalies/:anomalyId',
  [param('jobId').isUUID(), param('anomalyId').isUUID()],
  [
    body('status').isIn(['APPROVED', 'REJECTED']).withMessage('status must be APPROVED or REJECTED'),
    body('actionTaken').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { status, actionTaken } = req.body;
      const anomaly = await prisma.importAnomaly.findUnique({ where: { id: req.params.anomalyId } });
      if (!anomaly) return res.status(404).json({ success: false, error: 'Anomaly not found' });
      if (anomaly.importJobId !== req.params.jobId) {
        return res.status(400).json({ success: false, error: 'Anomaly does not belong to this job' });
      }

      const updated = await prisma.importAnomaly.update({
        where: { id: req.params.anomalyId },
        data: {
          status,
          resolvedBy: req.user.id,
          resolvedAt: new Date(),
          actionTaken: actionTaken || `Manually ${status.toLowerCase()} by user`,
        },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/import/:jobId/anomalies/bulk-resolve — bulk approve/reject by severity
router.post(
  '/:jobId/anomalies/bulk-resolve',
  param('jobId').isUUID(),
  [
    body('severity').optional().isIn(['ERROR', 'WARNING', 'INFO']),
    body('status').isIn(['APPROVED', 'REJECTED']).withMessage('status must be APPROVED or REJECTED'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { severity, status } = req.body;
      const where = {
        importJobId: req.params.jobId,
        status: 'PENDING',
        ...(severity && { severity }),
      };
      const result = await prisma.importAnomaly.updateMany({
        where,
        data: {
          status,
          resolvedBy: req.user.id,
          resolvedAt: new Date(),
          actionTaken: `Bulk ${status.toLowerCase()} by user`,
        },
      });
      res.json({ success: true, data: { updated: result.count } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/import/:jobId/apply — commit approved rows to database
router.post('/:jobId/apply', param('jobId').isUUID(), validate, async (req, res, next) => {
  try {
    const job = await prisma.importJob.findUnique({ where: { id: req.params.jobId } });
    if (!job) return res.status(404).json({ success: false, error: 'Import job not found' });
    if (job.status === 'COMPLETED') {
      return res.status(409).json({ success: false, error: 'Import already applied' });
    }

    // Check for pending ERROR anomalies — must resolve all before applying
    const pendingErrors = await prisma.importAnomaly.count({
      where: { importJobId: req.params.jobId, status: 'PENDING', severity: 'ERROR' },
    });
    if (pendingErrors > 0) {
      return res.status(400).json({
        success: false,
        error: `${pendingErrors} unresolved ERROR anomaly(ies) must be approved or rejected before applying`,
      });
    }

    const result = await applyImport(req.params.jobId, job.groupId, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error(`Import apply error: ${err.message}`);
    next(err);
  }
});

// GET /api/import/:jobId/report — final import report
router.get('/:jobId/report', param('jobId').isUUID(), validate, async (req, res, next) => {
  try {
    const job = await prisma.importJob.findUnique({
      where: { id: req.params.jobId },
      include: {
        anomalies: { orderBy: { rowNumber: 'asc' } },
        expenses: {
          select: { id: true, description: true, amount: true, currency: true, expenseDate: true },
          where: { deletedAt: null },
        },
      },
    });
    if (!job) return res.status(404).json({ success: false, error: 'Import job not found' });
    res.json({ success: true, data: job });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
