const { Router } = require('express');
const activityLogService = require('../services/activityLog.service');
const { authenticate, authorize } = require('../middlewares/auth');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const router = Router();

router.use(authenticate);

router.get('/', authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const result = await activityLogService.findAll(page, limit);
    sendSuccess(res, 'Activity logs retrieved', result.logs, 200, result.pagination);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve activity logs', 500);
  }
});

router.get('/candidate/:id', authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const logs = await activityLogService.findByCandidateId(req.params.id);
    sendSuccess(res, 'Candidate activity logs retrieved', logs);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve logs', 500);
  }
});

module.exports = router;
