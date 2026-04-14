const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');
const automationService = require('../services/assessment-automation.service');
const automationJobService = require('../services/automation-job.service');
const automationStreamService = require('../services/automation-stream.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { query, run } = require('../database/db');
const { normalizePosition } = require('../utils/position-normalizer');

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

router.get('/jobs', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 100);
    const jobs = await automationJobService.listJobs(limit);
    sendSuccess(res, 'Automation jobs retrieved', jobs);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve jobs', 500);
  }
});

router.get('/jobs/:jobId', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const job = await automationJobService.getJob(req.params.jobId);
    if (!job) {
      return sendError(res, 'Job not found', 404);
    }
    sendSuccess(res, 'Automation job retrieved', job);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve job', 500);
  }
});

router.get('/jobs/:jobId/items', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const job = await automationJobService.getJob(req.params.jobId);
    if (!job) {
      return sendError(res, 'Job not found', 404);
    }
    const items = await automationJobService.getJobItems(req.params.jobId);
    sendSuccess(res, 'Automation job items retrieved', items);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve job items', 500);
  }
});

router.get('/jobs/:jobId/stream', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const job = await automationJobService.getJob(req.params.jobId);
    if (!job) {
      return sendError(res, 'Job not found', 404);
    }

    automationStreamService.subscribe(req.params.jobId, res);
    res.write(`event: snapshot\ndata: ${JSON.stringify(job)}\n\n`);

    req.on('close', () => {
      automationStreamService.unsubscribe(req.params.jobId, res);
    });
  } catch (error) {
    sendError(res, error.message || 'Failed to subscribe to job stream', 500);
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

// Manual trigger - process INBOX candidates with optional limit
router.post('/process-all', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const results = await automationService.processInboxCandidates(limit);
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

router.post('/process-batch-preview', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { candidateIds } = req.body;

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return sendError(res, 'candidateIds array is required', 400);
    }

    const job = await automationJobService.createPreviewJob(candidateIds, req.user?.id || null);
    sendSuccess(res, 'Preview job queued', job, 202);
  } catch (error) {
    sendError(res, error.message || 'Failed to queue preview job', error.statusCode || 500);
  }
});

// Process batch of selected candidates
router.post('/process-batch', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { candidateIds, sourceJobId = null } = req.body;

    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
      return sendError(res, 'candidateIds array is required', 400);
    }

    const job = await automationJobService.createSendJob(candidateIds, req.user?.id || null, sourceJobId);
    sendSuccess(res, 'Send job queued', job, 202);
  } catch (error) {
    sendError(res, error.message || 'Failed to queue send job', error.statusCode || 500);
  }
});

// Normalize all candidate positions
router.post('/normalize-positions', authenticate, authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const logger = require('../services/logger.service');
    const { detectPositionFromCV } = require('../utils/position-normalizer');
    const fs = require('fs');
    const path = require('path');
    
    logger.info('NORMALIZE_POSITIONS', 'Starting smart position normalization for all candidates');
    
    // Get all candidates with CV paths
    const candidates = await query('SELECT id, position, cv_path, ai_summary FROM candidates');
    
    let updated = 0;
    let cvAnalyzed = 0;
    const changes = [];
    
    for (const candidate of candidates) {
      let normalizedPosition = normalizePosition(candidate.position);
      
      // If normalizePosition returns null, it means we need CV analysis
      if (normalizedPosition === null) {
        logger.info('CV_ANALYSIS_NEEDED', `Analyzing CV for candidate ${candidate.id} with position: "${candidate.position}"`);
        
        // Try to get CV content
        let cvContent = candidate.ai_summary || '';
        
        // If no AI summary, try to read CV file
        if (!cvContent && candidate.cv_path) {
          try {
            const cvPath = path.join(process.cwd(), 'uploads', candidate.cv_path);
            if (fs.existsSync(cvPath)) {
              // For now, just use filename as hint
              cvContent = candidate.cv_path;
            }
          } catch (err) {
            logger.error('CV_READ_ERROR', `Failed to read CV for ${candidate.id}`, { error: err.message });
          }
        }
        
        // Detect position from CV content
        normalizedPosition = detectPositionFromCV(cvContent);
        cvAnalyzed++;
        
        logger.info('CV_POSITION_DETECTED', `Detected position: ${normalizedPosition} for candidate ${candidate.id}`);
      }
      
      // Update if position changed
      if (normalizedPosition && normalizedPosition !== candidate.position) {
        await run(
          'UPDATE candidates SET position = ? WHERE id = ?',
          [normalizedPosition, candidate.id]
        );
        changes.push({
          id: candidate.id,
          old: candidate.position,
          new: normalizedPosition,
          method: normalizedPosition === detectPositionFromCV(candidate.ai_summary || '') ? 'CV Analysis' : 'Pattern Matching'
        });
        updated++;
      }
    }
    
    logger.success('NORMALIZE_POSITIONS', `Normalized ${updated} out of ${candidates.length} candidates (${cvAnalyzed} via CV analysis)`);
    
    sendSuccess(res, `Position normalization complete. Updated ${updated} out of ${candidates.length} candidates (${cvAnalyzed} analyzed from CV).`, {
      total: candidates.length,
      updated,
      cvAnalyzed,
      changes
    });
  } catch (error) {
    logger.error('NORMALIZE_POSITIONS_ERROR', 'Failed to normalize positions', { error: error.message });
    sendError(res, error.message || 'Failed to normalize positions', 500);
  }
});

module.exports = router;
