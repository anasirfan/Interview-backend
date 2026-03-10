const bcrypt = require('bcrypt');
const { get, run } = require('../database/db');
const { generateUUID } = require('../utils/uuid');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');

class AuthService {
  async login(email, password) {
    const admin = await get('SELECT * FROM admins WHERE email = ?', [email]);
    
    if (!admin) {
      throw new Error('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const payload = { id: admin.id, email: admin.email, role: admin.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await run('UPDATE admins SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
      [refreshToken, admin.id]);

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    };
  }

  async refresh(refreshToken) {
    const admin = await get('SELECT * FROM admins WHERE refresh_token = ?', [refreshToken]);
    
    if (!admin) {
      throw new Error('Invalid refresh token');
    }

    const payload = { id: admin.id, email: admin.email, role: admin.role };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    await run('UPDATE admins SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newRefreshToken, admin.id]);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };
  }

  async logout(adminId) {
    await run('UPDATE admins SET refresh_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [adminId]);
  }

  async getMe(adminId) {
    const admin = await get('SELECT id, name, email, role, avatar_url, created_at FROM admins WHERE id = ?',
      [adminId]);
    
    if (!admin) {
      throw new Error('Admin not found');
    }

    return admin;
  }
}

module.exports = new AuthService();
