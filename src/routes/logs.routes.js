const express = require('express');
const router = express.Router();
const logger = require('../services/logger.service');
const { authenticate } = require('../middlewares/auth');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Get logs by type
router.get('/:logType', authenticate, async (req, res) => {
  try {
    const { logType } = req.params;
    const { limit = 100 } = req.query;
    
    const logs = logger.readLogs(logType, parseInt(limit));
    
    sendSuccess(res, `${logType} logs retrieved`, logs);
  } catch (error) {
    logger.error('LOGS_API', 'Failed to retrieve logs', { error: error.message });
    sendError(res, error.message || 'Failed to retrieve logs', 500);
  }
});

// Get all available log types
router.get('/', authenticate, async (req, res) => {
  try {
    const logTypes = logger.getLogTypes();
    
    sendSuccess(res, 'Log types retrieved', { logTypes });
  } catch (error) {
    logger.error('LOGS_API', 'Failed to retrieve log types', { error: error.message });
    sendError(res, error.message || 'Failed to retrieve log types', 500);
  }
});

module.exports = router;
