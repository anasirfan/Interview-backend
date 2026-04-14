const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { query } = require('../database/db');

// Get all candidates who have messages with unread counts
router.get('/candidates', authenticate, async (req, res) => {
  try {
    const { category, unread } = req.query;
    const clauses = ['EXISTS (SELECT 1 FROM messages m WHERE m.candidate_id = c.id)'];
    const params = [];

    if (category) {
      clauses.push('c.round_stage = ?');
      params.push(category);
    }

    if (unread === 'true') {
      clauses.push(`EXISTS (
        SELECT 1 FROM messages mu
        WHERE mu.candidate_id = c.id
          AND mu.direction = 'RECEIVED'
          AND mu.is_read = 0
      )`);
    }

    const candidates = await query(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM messages
         WHERE candidate_id = c.id
         AND direction = 'RECEIVED'
         AND is_read = 0) as unread_count,
        (SELECT MAX(created_at) FROM messages
         WHERE candidate_id = c.id) as last_message_date
      FROM candidates c
      WHERE ${clauses.join(' AND ')}
      ORDER BY last_message_date DESC
    `, params);
    
    sendSuccess(res, 'Candidates with messages retrieved', candidates);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve candidates', 500);
  }
});

router.get('/category-counts', authenticate, async (_req, res) => {
  try {
    const counts = await query(`
      SELECT
        COALESCE(round_stage, 'UNKNOWN') as category,
        COUNT(*) as count
      FROM candidates c
      WHERE EXISTS (SELECT 1 FROM messages m WHERE m.candidate_id = c.id)
      GROUP BY COALESCE(round_stage, 'UNKNOWN')
      ORDER BY category ASC
    `);

    sendSuccess(res, 'Message category counts retrieved', counts);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve category counts', 500);
  }
});

// Get conversation for a specific candidate
router.get('/conversation/:candidateId', authenticate, async (req, res) => {
  try {
    const { candidateId } = req.params;
    
    // Get candidate info
    const candidates = await query('SELECT * FROM candidates WHERE id = ?', [candidateId]);
    
    if (!candidates || candidates.length === 0) {
      return sendError(res, 'Candidate not found', 404);
    }
    
    const candidate = candidates[0];
    
    // Get all messages for this candidate
    const messages = await query(
      'SELECT * FROM messages WHERE candidate_id = ? ORDER BY created_at ASC',
      [candidateId]
    );
    
    sendSuccess(res, 'Conversation retrieved', {
      candidate,
      messages
    });
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve conversation', 500);
  }
});

// Get unread message count
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT COUNT(*) as count FROM messages WHERE is_read = 0 AND direction = "RECEIVED"'
    );
    
    sendSuccess(res, 'Unread count retrieved', { count: result[0].count });
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve unread count', 500);
  }
});

// Mark messages as read
router.post('/mark-read/:candidateId', authenticate, async (req, res) => {
  try {
    const { candidateId } = req.params;
    
    await query(
      'UPDATE messages SET is_read = 1 WHERE candidate_id = ? AND direction = "RECEIVED"',
      [candidateId]
    );
    
    sendSuccess(res, 'Messages marked as read');
  } catch (error) {
    sendError(res, error.message || 'Failed to mark messages as read', 500);
  }
});

// Send reply to candidate
router.post('/:candidateId/send-reply', authenticate, async (req, res) => {
  try {
    const { candidateId } = req.params;
    const { subject, body } = req.body;
    
    // Get candidate info
    const candidates = await query('SELECT * FROM candidates WHERE id = ?', [candidateId]);
    
    if (!candidates || candidates.length === 0) {
      return sendError(res, 'Candidate not found', 404);
    }
    
    const candidate = candidates[0];
    
    const { gmailWorker } = require('../workers/gmail.worker');
    await gmailWorker.sendReply(candidate.email, subject, body);
    
    // Store message in database
    const { v4: uuidv4 } = require('uuid');
    await query(`
      INSERT INTO messages (id, candidate_id, gmail_message_id, direction, subject, body, is_read, created_at)
      VALUES (?, ?, ?, 'SENT', ?, ?, 1, CURRENT_TIMESTAMP)
    `, [uuidv4(), candidateId, null, subject, body]);
    
    const logger = require('../services/logger.service');
    logger.success('MESSAGE_REPLY', `Reply sent to ${candidate.name}`, {
      candidateId,
      email: candidate.email,
      subject
    });
    
    sendSuccess(res, 'Reply sent successfully');
  } catch (error) {
    const logger = require('../services/logger.service');
    logger.error('MESSAGE_REPLY', 'Failed to send reply', { error: error.message });
    sendError(res, error.message || 'Failed to send reply', 500);
  }
});

module.exports = router;
