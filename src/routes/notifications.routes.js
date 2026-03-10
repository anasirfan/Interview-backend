const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { query } = require('../database/db');

// Get recent notifications (both read and unread)
router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await query(`
      SELECT * FROM notifications 
      ORDER BY created_at DESC 
      LIMIT 20
    `);
    
    sendSuccess(res, 'Notifications retrieved', notifications);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve notifications', 500);
  }
});

// Mark notification as read
router.post('/:id/mark-read', authenticate, async (req, res) => {
  try {
    await query('UPDATE notifications SET is_read = 1 WHERE id = ?', [req.params.id]);
    sendSuccess(res, 'Notification marked as read');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Get notification counts by type
router.get('/counts', authenticate, async (req, res) => {
  try {
    const counts = await query(`
      SELECT 
        type,
        COUNT(*) as count
      FROM notifications 
      WHERE is_read = 0 
      GROUP BY type
    `);
    
    const result = {
      total: counts.reduce((sum, item) => sum + item.count, 0),
      byType: counts.reduce((acc, item) => {
        acc[item.type] = item.count;
        return acc;
      }, {})
    };
    
    sendSuccess(res, 'Notification counts retrieved', result);
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

module.exports = router;
