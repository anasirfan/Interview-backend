require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const candidateRoutes = require('./routes/candidate.routes');
const adminRoutes = require('./routes/admin.routes');
const activityLogRoutes = require('./routes/activityLog.routes');
const aiRoutes = require('./routes/ai.routes');
const googleRoutes = require('./routes/google.routes');
const logsRoutes = require('./routes/logs.routes');
const messagesRoutes = require('./routes/messages.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const cronRoutes = require('./routes/cron.routes');
const { cronService } = require('./services/cron.service');
const { gmailWorker } = require('./workers/gmail.worker');
const { driveWorker } = require('./workers/drive.worker');
const { query } = require('./database/db');

const app = express();

// Allow multiple origins for CORS
const allowedOrigins = [
  'http://localhost:3000',
  'https://ims-frontend-smoky-chi.vercel.app',
  process.env.CORS_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins for now to debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/google', googleRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/automation', require('./routes/automation.routes'));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'IMS API is running', data: null });
});

app.get('/api/health/cron', (_req, res) => {
  const status = cronService.getStatus();
  res.json({ 
    success: true, 
    message: 'Cron job status', 
    data: status 
  });
});

app.get('/api/cron/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await query(`
      SELECT * FROM cron_logs 
      ORDER BY created_at DESC 
      LIMIT ?
    `, [limit]);
    
    res.json({ success: true, message: 'Cron logs retrieved', data: logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, data: null });
  }
});

app.post('/api/cron/start', (_req, res) => {
  try {
    cronService.start();
    res.json({ success: true, message: 'All cron jobs started', data: cronService.getStatus() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, data: null });
  }
});

app.post('/api/cron/stop', (_req, res) => {
  try {
    cronService.stop();
    res.json({ success: true, message: 'All cron jobs stopped', data: cronService.getStatus() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, data: null });
  }
});

app.post('/api/cron/trigger/gmail', async (_req, res) => {
  try {
    const result = await cronService.triggerGmailProcessing();
    res.json({ success: true, message: 'Gmail processing triggered', data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, data: null });
  }
});

app.post('/api/cron/trigger/replies', async (_req, res) => {
  try {
    const result = await cronService.triggerReplyCheck();
    res.json({ success: true, message: 'Reply check triggered', data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message, data: null });
  }
});

app.get('/api/health/ai', (_req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  res.json({
    success: true,
    message: 'AI health status',
    data: {
      gemini: {
        configured: !!geminiKey && geminiKey.length > 5,
        status: geminiKey && geminiKey.length > 5 ? 'active' : 'awaiting_key',
      },
      gmail: {
        configured: !!googleClientId && !!googleClientSecret,
        status: googleClientId && googleClientSecret ? 'ready' : 'awaiting_config',
        note: googleClientId && googleClientSecret ? 'OAuth credentials set. Connect via Google OAuth to activate.' : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env',
      },
      drive: {
        configured: !!googleClientId && !!googleClientSecret,
        status: googleClientId && googleClientSecret ? 'ready' : 'awaiting_config',
        note: googleClientId && googleClientSecret ? 'OAuth credentials set. Connect via Google OAuth to activate.' : 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env',
      },
      workers: {
        gmail: gmailWorker.getStatus(),
        drive: driveWorker.getStatus(),
      }
    },
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    data: null
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Database: SQLite (direct connection)`);
  
  cronService.initialize();
  console.log('[Server] Cron service initialized (use /api/cron/trigger/* to start jobs)');
});

module.exports = app;
