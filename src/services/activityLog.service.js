const { query, get, run } = require('../database/db');
const { generateUUID } = require('../utils/uuid');

class ActivityLogService {
  async create(data) {
    const id = generateUUID();
    
    await run(`
      INSERT INTO activity_logs (id, action, entity, entity_id, details, admin_id, candidate_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      data.action,
      data.entity,
      data.entityId,
      data.details || null,
      data.adminId,
      data.candidateId || null
    ]);

    return get('SELECT * FROM activity_logs WHERE id = ?', [id]);
  }

  async findAll(page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    
    const logs = await query(`
      SELECT 
        al.*,
        a.name as admin_name,
        a.email as admin_email,
        c.name as candidate_name
      FROM activity_logs al
      LEFT JOIN admins a ON al.admin_id = a.id
      LEFT JOIN candidates c ON al.candidate_id = c.id
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countResult = await get('SELECT COUNT(*) as count FROM activity_logs');
    const total = countResult.count;

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findByCandidateId(candidateId, limit = 20) {
    return query(`
      SELECT 
        al.*,
        a.name as admin_name,
        a.email as admin_email
      FROM activity_logs al
      LEFT JOIN admins a ON al.admin_id = a.id
      WHERE al.candidate_id = ?
      ORDER BY al.created_at DESC
      LIMIT ?
    `, [candidateId, limit]);
  }

  async findByAdminId(adminId, limit = 50) {
    return query(`
      SELECT 
        al.*,
        c.name as candidate_name
      FROM activity_logs al
      LEFT JOIN candidates c ON al.candidate_id = c.id
      WHERE al.admin_id = ?
      ORDER BY al.created_at DESC
      LIMIT ?
    `, [adminId, limit]);
  }
}

module.exports = new ActivityLogService();
