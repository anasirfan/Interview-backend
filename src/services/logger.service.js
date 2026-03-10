const fs = require('fs');
const path = require('path');

class LoggerService {
  constructor() {
    this.logsDir = path.join(__dirname, '../../logs');
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  getTimestamp() {
    return new Date().toISOString();
  }

  formatLogEntry(level, category, message, details = {}) {
    return JSON.stringify({
      timestamp: this.getTimestamp(),
      level,
      category,
      message,
      details,
      pid: process.pid
    }) + '\n';
  }

  writeLog(filename, entry) {
    const filepath = path.join(this.logsDir, filename);
    fs.appendFileSync(filepath, entry, 'utf8');
  }

  // General logging
  info(category, message, details = {}) {
    const entry = this.formatLogEntry('INFO', category, message, details);
    this.writeLog('app.log', entry);
    console.log(`[${category}] ${message}`, details);
  }

  error(category, message, details = {}) {
    const entry = this.formatLogEntry('ERROR', category, message, details);
    this.writeLog('error.log', entry);
    this.writeLog('app.log', entry);
    console.error(`[${category}] ERROR: ${message}`, details);
  }

  success(category, message, details = {}) {
    const entry = this.formatLogEntry('SUCCESS', category, message, details);
    this.writeLog('success.log', entry);
    this.writeLog('app.log', entry);
    console.log(`[${category}] SUCCESS: ${message}`, details);
  }

  // Email specific logging
  emailSent(recipient, subject, details = {}) {
    const entry = this.formatLogEntry('EMAIL_SENT', 'EMAIL', `Email sent to ${recipient}`, {
      recipient,
      subject,
      ...details
    });
    this.writeLog('email.log', entry);
    this.writeLog('app.log', entry);
    console.log(`[EMAIL] Sent to ${recipient}: ${subject}`);
  }

  emailFailed(recipient, subject, error, details = {}) {
    const entry = this.formatLogEntry('EMAIL_FAILED', 'EMAIL', `Failed to send email to ${recipient}`, {
      recipient,
      subject,
      error: error.message || error,
      ...details
    });
    this.writeLog('email.log', entry);
    this.writeLog('error.log', entry);
    this.writeLog('app.log', entry);
    console.error(`[EMAIL] Failed to send to ${recipient}: ${error.message || error}`);
  }

  // Fetching/API logs
  apiFetch(endpoint, method, details = {}) {
    const entry = this.formatLogEntry('API_FETCH', 'FETCH', `${method} ${endpoint}`, details);
    this.writeLog('fetch.log', entry);
    console.log(`[FETCH] ${method} ${endpoint}`);
  }

  apiError(endpoint, method, error, details = {}) {
    const entry = this.formatLogEntry('API_ERROR', 'FETCH', `${method} ${endpoint} failed`, {
      error: error.message || error,
      ...details
    });
    this.writeLog('fetch.log', entry);
    this.writeLog('error.log', entry);
    console.error(`[FETCH] ${method} ${endpoint} failed:`, error.message || error);
  }

  // Gmail worker logs
  gmailFetch(count, details = {}) {
    const entry = this.formatLogEntry('GMAIL_FETCH', 'GMAIL', `Fetched ${count} emails`, details);
    this.writeLog('fetch.log', entry);
    this.writeLog('app.log', entry);
    console.log(`[GMAIL] Fetched ${count} emails`);
  }

  gmailProcessed(email, action, details = {}) {
    const entry = this.formatLogEntry('GMAIL_PROCESSED', 'GMAIL', `Processed email: ${action}`, {
      email,
      action,
      ...details
    });
    this.writeLog('fetch.log', entry);
    this.writeLog('app.log', entry);
    console.log(`[GMAIL] Processed: ${action} - ${email}`);
  }

  // Read logs from file
  readLogs(logType = 'app', limit = 100) {
    const filename = `${logType}.log`;
    const filepath = path.join(this.logsDir, filename);

    if (!fs.existsSync(filepath)) {
      return [];
    }

    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.trim().split('\n').filter(line => line);
    
    // Get last N lines
    const recentLines = lines.slice(-limit);
    
    return recentLines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return { raw: line };
      }
    }).reverse(); // Most recent first
  }

  // Get all log types
  getLogTypes() {
    if (!fs.existsSync(this.logsDir)) {
      return [];
    }

    return fs.readdirSync(this.logsDir)
      .filter(file => file.endsWith('.log'))
      .map(file => file.replace('.log', ''));
  }

  // Clear old logs (optional maintenance)
  clearOldLogs(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const logTypes = this.getLogTypes();
    
    logTypes.forEach(logType => {
      const filepath = path.join(this.logsDir, `${logType}.log`);
      
      if (!fs.existsSync(filepath)) return;

      const content = fs.readFileSync(filepath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line);
      
      const filteredLines = lines.filter(line => {
        try {
          const log = JSON.parse(line);
          const logDate = new Date(log.timestamp);
          return logDate >= cutoffDate;
        } catch (e) {
          return true; // Keep malformed lines
        }
      });

      fs.writeFileSync(filepath, filteredLines.join('\n') + '\n', 'utf8');
    });

    this.info('LOGGER', `Cleared logs older than ${daysToKeep} days`);
  }
}

module.exports = new LoggerService();
