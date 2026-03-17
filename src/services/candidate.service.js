const { query, get, run } = require('../database/db');
const { generateUUID } = require('../utils/uuid');
const { normalizePosition } = require('../utils/position-normalizer');

class CandidateService {
  async create(data) {
    const id = generateUUID();
    
    // Normalize position before saving
    const normalizedPosition = normalizePosition(data.position);
    
    await run(`
      INSERT INTO candidates (
        id, name, email, phone, position, status, round_stage, cv_path, gmail_thread_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      data.name,
      data.email,
      data.phone || null,
      normalizedPosition,
      data.status || 'INBOX',
      data.roundStage || 'INBOX',
      data.cvPath || null,
      data.gmailThreadId || null
    ]);

    return this.findById(id);
  }

  async findAll(filters = {}) {
    let sql = 'SELECT * FROM candidates WHERE 1=1';
    const params = [];

    if (filters.isArchived !== undefined) {
      sql += ' AND is_archived = ?';
      params.push(filters.isArchived ? 1 : 0);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.position) {
      sql += ' AND position LIKE ?';
      params.push(`%${filters.position}%`);
    }

    if (filters.search) {
      sql += ' AND (name LIKE ? OR email LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    sql += ' ORDER BY created_at DESC';

    if (filters.limit) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(filters.limit, filters.offset || 0);
    }

    return query(sql, params);
  }

  async findById(id) {
    return get('SELECT * FROM candidates WHERE id = ?', [id]);
  }

  async update(id, data) {
    const fields = [];
    const values = [];

    // Normalize position if it's being updated
    if (data.position !== undefined) {
      data.position = normalizePosition(data.position);
    }

    const allowedFields = [
      'name', 'email', 'phone', 'position', 'interview_date', 'status', 'round_stage',
      'remarks', 'cv_path', 'meeting_recording', 'meeting_notes', 'assessment_given',
      'assessment_link', 'completed_link', 'rating', 'is_archived', 'ai_score',
      'ai_feedback', 'key_highlights', 'ai_summary', 'google_drive_link', 'meet_transcript',
      'gmail_thread_id', 'calendar_event_id', 'meet_link', 'interviewer_id', 'interview_questions'
    ];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const sql = `UPDATE candidates SET ${fields.join(', ')} WHERE id = ?`;
    await run(sql, values);

    return this.findById(id);
  }

  async delete(id) {
    await run('DELETE FROM candidates WHERE id = ?', [id]);
  }

  async count(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM candidates WHERE 1=1';
    const params = [];

    if (filters.isArchived !== undefined) {
      sql += ' AND is_archived = ?';
      params.push(filters.isArchived ? 1 : 0);
    }

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }

    const result = await get(sql, params);
    return result.count;
  }

  async getMetrics() {
    const total = await get('SELECT COUNT(*) as count FROM candidates WHERE is_archived = 0');
    const inbox = await get('SELECT COUNT(*) as count FROM candidates WHERE status = ? AND is_archived = 0', ['INBOX']);
    const assessment = await get('SELECT COUNT(*) as count FROM candidates WHERE status = ? AND is_archived = 0', ['ASSESSMENT']);
    const scheduled = await get('SELECT COUNT(*) as count FROM candidates WHERE status = ? AND is_archived = 0', ['SCHEDULED']);
    const interview = await get('SELECT COUNT(*) as count FROM candidates WHERE status = ? AND is_archived = 0', ['INTERVIEW']);
    const shortlisted = await get('SELECT COUNT(*) as count FROM candidates WHERE status = ? AND is_archived = 0', ['SHORTLISTED']);
    const rejected = await get('SELECT COUNT(*) as count FROM candidates WHERE status = ? AND is_archived = 0', ['REJECTED']);

    return {
      total: total.count,
      byStatus: {
        inbox: inbox.count,
        assessment: assessment.count,
        scheduled: scheduled.count,
        interview: interview.count,
        shortlisted: shortlisted.count,
        rejected: rejected.count
      }
    };
  }
}

module.exports = new CandidateService();
