const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  
  const schema = `
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'HR_ADMIN',
      refresh_token TEXT,
      google_token TEXT,
      google_refresh TEXT,
      avatar_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id INTEGER PRIMARY KEY DEFAULT 1,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER,
      scope TEXT,
      token_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      position TEXT NOT NULL,
      interview_date TEXT,
      status TEXT DEFAULT 'INBOX',
      round_stage TEXT DEFAULT 'INBOX',
      remarks TEXT,
      cv_path TEXT,
      meeting_recording TEXT,
      meeting_notes TEXT,
      assessment_given INTEGER DEFAULT 0,
      assessment_link TEXT,
      completed_link TEXT,
      rating INTEGER,
      is_archived INTEGER DEFAULT 0,
      ai_score REAL,
      ai_feedback TEXT,
      key_highlights TEXT,
      ai_summary TEXT,
      google_drive_link TEXT,
      meet_transcript TEXT,
      gmail_thread_id TEXT,
      calendar_event_id TEXT,
      meet_link TEXT,
      interviewer_id TEXT,
      interview_questions TEXT,
      interviewer TEXT,
      assessment_status TEXT,
      assessment_generated_at TEXT,
      assessment_sent_at TEXT,
      assessment_retry_count INTEGER DEFAULT 0,
      automation_mode TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (interviewer_id) REFERENCES admins(id)
    );

    CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(email);
    CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
    CREATE INDEX IF NOT EXISTS idx_candidates_round_stage ON candidates(round_stage);
    CREATE INDEX IF NOT EXISTS idx_candidates_interview_date ON candidates(interview_date);
    CREATE INDEX IF NOT EXISTS idx_candidates_is_archived ON candidates(is_archived);
    CREATE INDEX IF NOT EXISTS idx_candidates_position ON candidates(position);
    CREATE INDEX IF NOT EXISTS idx_candidates_interviewer_id ON candidates(interviewer_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL,
      gmail_message_id TEXT,
      direction TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_candidate_id ON messages(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_messages_direction ON messages(direction);

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      candidate_id TEXT,
      candidate_name TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT,
      admin_id TEXT NOT NULL,
      candidate_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activity_logs_admin_id ON activity_logs(admin_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_candidate_id ON activity_logs(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

    CREATE TABLE IF NOT EXISTS cron_logs (
      id TEXT PRIMARY KEY,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      duration INTEGER,
      message TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_cron_logs_job_name ON cron_logs(job_name);
    CREATE INDEX IF NOT EXISTS idx_cron_logs_status ON cron_logs(status);
    CREATE INDEX IF NOT EXISTS idx_cron_logs_created_at ON cron_logs(created_at);

    CREATE TABLE IF NOT EXISTS automation_settings (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'off',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS automation_jobs (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT,
      source_job_id TEXT,
      total_items INTEGER NOT NULL DEFAULT 0,
      processed_items INTEGER NOT NULL DEFAULT 0,
      successful_items INTEGER NOT NULL DEFAULT 0,
      failed_items INTEGER NOT NULL DEFAULT 0,
      skipped_items INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_automation_jobs_created_at ON automation_jobs(created_at);

    CREATE TABLE IF NOT EXISTS automation_job_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      candidate_name TEXT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sequence_no INTEGER NOT NULL DEFAULT 0,
      pdf_file_name TEXT,
      assessment_data TEXT,
      email_data TEXT,
      error_message TEXT,
      source_job_item_id TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES automation_jobs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_automation_job_items_job_id ON automation_job_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_automation_job_items_candidate_id ON automation_job_items(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_automation_job_items_status ON automation_job_items(status);
  `;

  db.exec(schema, (err) => {
    if (err) {
      console.error('[Database] Schema initialization error:', err);
    } else {
      console.log('[Database] Schema initialized successfully');
    }
  });
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

module.exports = { db, query, get, run };
