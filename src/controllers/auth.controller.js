const authService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');

async function login(req, res) {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return sendError(res, 'Email and password are required', 400);
    }

    // Capture device information for multi-device support
    const deviceInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      device: req.body.deviceName || 'Web Browser'
    };

    const result = await authService.login(email, password, deviceInfo);
    
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    sendSuccess(res, 'Login successful', result);
  } catch (error) {
    sendError(res, error.message || 'Login failed', 401);
  }
}

async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return sendError(res, 'Refresh token required', 400);
    }

    const result = await authService.refresh(refreshToken);
    
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    sendSuccess(res, 'Token refreshed', result);
  } catch (error) {
    sendError(res, error.message || 'Token refresh failed', 401);
  }
}

async function logout(req, res) {
  try {
    const { refreshToken, logoutAll } = req.body;
    
    if (logoutAll) {
      // Logout from all devices
      await authService.logout(req.user.id);
    } else {
      // Logout from current device only
      await authService.logout(req.user.id, refreshToken);
    }
    
    res.clearCookie('refreshToken');
    sendSuccess(res, 'Logout successful');
  } catch (error) {
    sendError(res, error.message || 'Logout failed', 500);
  }
}

async function getMe(req, res) {
  try {
    const admin = await authService.getMe(req.user.id);
    sendSuccess(res, 'Profile retrieved', admin);
  } catch (error) {
    sendError(res, error.message || 'Failed to get profile', 500);
  }
}

module.exports = { login, refresh, logout, getMe };
