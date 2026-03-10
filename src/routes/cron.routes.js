const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { cronService } = require('../services/cron.service');

// Manual trigger for scheduled interview status transition
router.post('/trigger/status-transition', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const result = await cronService.checkScheduledInterviews();
    sendSuccess(res, 'Status transition check completed', result);
  } catch (error) {
    sendError(res, error.message || 'Failed to run status transition check', 500);
  }
});

// Manual trigger for recording/notes matching
router.post('/trigger/auto-match-recordings', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const result = await cronService.autoMatchRecordingsAndNotes();
    sendSuccess(res, 'Recording matching completed', result);
  } catch (error) {
    sendError(res, error.message || 'Failed to run recording matching', 500);
  }
});

// Manual trigger for Gmail fetch
router.post('/trigger/gmail-fetch', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const result = await cronService.triggerGmailProcessing();
    sendSuccess(res, 'Gmail fetch completed', result);
  } catch (error) {
    sendError(res, error.message || 'Failed to fetch Gmail', 500);
  }
});

// Manual trigger for reply check
router.post('/trigger/reply-check', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const result = await cronService.triggerReplyCheck();
    sendSuccess(res, 'Reply check completed', result);
  } catch (error) {
    sendError(res, error.message || 'Failed to check replies', 500);
  }
});

// Get cron job status
router.get('/status', authenticate, async (req, res) => {
  try {
    const status = cronService.getStatus();
    sendSuccess(res, 'Cron status retrieved', status);
  } catch (error) {
    sendError(res, error.message || 'Failed to get cron status', 500);
  }
});

module.exports = router;
