const bcrypt = require('bcrypt');
const { get, run, query } = require('../database/db');
const { generateUUID } = require('../utils/uuid');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwt');

class AuthService {
  async login(email, password, deviceInfo = {}) {
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

    // Try to store in refresh_tokens table (multi-device support)
    // Fallback to old method if table doesn't exist yet
    try {
      const tokenId = generateUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

      await run(`
        INSERT INTO refresh_tokens (id, admin_id, token, device_info, ip_address, user_agent, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        tokenId,
        admin.id,
        refreshToken,
        deviceInfo.device || 'Unknown Device',
        deviceInfo.ip || null,
        deviceInfo.userAgent || null,
        expiresAt.toISOString()
      ]);

      // Clean up expired tokens for this admin
      await run(`
        DELETE FROM refresh_tokens 
        WHERE admin_id = ? AND expires_at < datetime('now')
      `, [admin.id]);
    } catch (error) {
      // Fallback to old single-token method if refresh_tokens table doesn't exist
      console.warn('refresh_tokens table not found, using legacy method:', error.message);
      await run('UPDATE admins SET refresh_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
        [refreshToken, admin.id]);
    }

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
    // Try new refresh_tokens table first
    try {
      const tokenRecord = await get(`
        SELECT rt.*, a.id, a.email, a.role, a.name
        FROM refresh_tokens rt
        JOIN admins a ON rt.admin_id = a.id
        WHERE rt.token = ? AND rt.expires_at > datetime('now')
      `, [refreshToken]);
      
      if (tokenRecord) {
        const payload = { id: tokenRecord.id, email: tokenRecord.email, role: tokenRecord.role };
        const newAccessToken = generateAccessToken(payload);
        const newRefreshToken = generateRefreshToken(payload);

        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + 30);

        await run(`
          UPDATE refresh_tokens 
          SET token = ?, expires_at = ?, last_used_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [newRefreshToken, newExpiresAt.toISOString(), tokenRecord.id]);

        return {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken
        };
      }
    } catch (error) {
      console.warn('refresh_tokens table not found, trying legacy method:', error.message);
    }

    // Fallback to old method
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

  async logout(adminId, refreshToken = null) {
    try {
      if (refreshToken) {
        // Logout from specific device
        await run('DELETE FROM refresh_tokens WHERE admin_id = ? AND token = ?', [adminId, refreshToken]);
      } else {
        // Logout from all devices
        await run('DELETE FROM refresh_tokens WHERE admin_id = ?', [adminId]);
      }
    } catch (error) {
      // Fallback to old method if refresh_tokens table doesn't exist
      console.warn('refresh_tokens table not found, using legacy logout:', error.message);
      await run('UPDATE admins SET refresh_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [adminId]);
    }
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
