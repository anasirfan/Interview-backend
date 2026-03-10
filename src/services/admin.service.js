const bcrypt = require('bcrypt');
const { get, query, run } = require('../database/db');
const { generateUUID } = require('../utils/uuid');

class AdminService {
  async create(data) {
    const existing = await get('SELECT id FROM admins WHERE email = ?', [data.email]);
    
    if (existing) {
      throw new Error('Admin with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);
    const id = generateUUID();

    await run(`
      INSERT INTO admins (id, name, email, password, role)
      VALUES (?, ?, ?, ?, ?)
    `, [id, data.name, data.email, hashedPassword, data.role || 'HR_ADMIN']);

    return get('SELECT id, name, email, role, created_at FROM admins WHERE id = ?', [id]);
  }

  async findAll() {
    return query('SELECT id, name, email, role, created_at FROM admins ORDER BY created_at DESC');
  }
}

module.exports = new AdminService();
