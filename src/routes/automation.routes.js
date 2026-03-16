const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const automationService = require('../services/assessment-automation.service');

// Get automation settings
router.get('/settings', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const settings = await automationService.getAutomationSettings();
    sendSuccess(res, 'Automation settings retrieved', settings);
  } catch (error) {
    sendError(res, error.message || 'Failed to get settings', 500);
  }
});

// Update automation settings
router.put('/settings', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { mode } = req.body;
    
    if (!['off', 'automated', 'manual'].includes(mode)) {
      return sendError(res, 'Invalid mode. Must be: off, automated, or manual', 400);
    }

    await automationService.updateAutomationSettings(mode);
    sendSuccess(res, 'Automation settings updated', { mode });
  } catch (error) {
    sendError(res, error.message || 'Failed to update settings', 500);
  }
});

// Process single candidate - preview mode
router.post('/process-preview/:candidateId', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const result = await automationService.processCandidateAssessment(candidateId, 'preview');
    sendSuccess(res, 'Assessment generated for preview', result);
  } catch (error) {
    sendError(res, error.message || 'Failed to process assessment', 500);
  }
});

// Process single candidate - send immediately
router.post('/process-send/:candidateId', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const result = await automationService.processCandidateAssessment(candidateId, 'send');
    sendSuccess(res, 'Assessment generated and sent', result);
  } catch (error) {
    sendError(res, error.message || 'Failed to process and send assessment', 500);
  }
});

// Retry failed assessment
router.post('/retry/:candidateId', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const result = await automationService.processCandidateAssessment(candidateId, 'retry');
    sendSuccess(res, 'Assessment retry completed', result);
  } catch (error) {
    sendError(res, error.message || 'Failed to retry assessment', 500);
  }
});

// Delete generated assessment
router.delete('/delete/:candidateId', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { query } = require('../database/db');
    
    await query(
      `UPDATE candidates 
       SET assessment_status = NULL, 
           assessment_generated_at = NULL,
           assessment_sent_at = NULL,
           assessment_link = NULL,
           assessment_retry_count = 0
       WHERE id = ?`,
      [candidateId]
    );
    
    sendSuccess(res, 'Assessment deleted');
  } catch (error) {
    sendError(res, error.message || 'Failed to delete assessment', 500);
  }
});

// Manual trigger - process all INBOX candidates
router.post('/process-all', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const results = await automationService.processInboxCandidates();
    sendSuccess(res, 'Batch processing completed', results);
  } catch (error) {
    sendError(res, error.message || 'Failed to process candidates', 500);
  }
});

// Update per-candidate automation mode
router.put('/candidate-mode/:candidateId', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { mode } = req.body;
    const { query } = require('../database/db');
    
    if (mode && !['automated', 'manual', null].includes(mode)) {
      return sendError(res, 'Invalid mode. Must be: automated, manual, or null', 400);
    }

    await query(
      'UPDATE candidates SET automation_mode = ? WHERE id = ?',
      [mode, candidateId]
    );
    
    sendSuccess(res, 'Candidate automation mode updated', { candidateId, mode });
  } catch (error) {
    sendError(res, error.message || 'Failed to update candidate mode', 500);
  }
});

// Send assessment email (after preview approval)
router.post('/send-email/:candidateId', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { emailData, pdfFileName } = req.body;
    
    if (!emailData || !pdfFileName) {
      return sendError(res, 'Email data and PDF filename required', 400);
    }

    await automationService.sendAssessmentEmail(candidateId, emailData, pdfFileName);
    sendSuccess(res, 'Assessment email sent');
  } catch (error) {
    sendError(res, error.message || 'Failed to send email', 500);
  }
});

module.exports = router;
