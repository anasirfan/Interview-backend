const adminService = require('../services/admin.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');

async function createAdmin(req, res) {
  try {
    const { name, email, password, role } = req.body;
    
    if (!name || !email || !password) {
      return sendError(res, 'Name, email, and password are required', 400);
    }

    const admin = await adminService.create({ name, email, password, role });
    sendSuccess(res, 'Admin created successfully', admin, 201);
  } catch (error) {
    sendError(res, error.message || 'Failed to create admin', 500);
  }
}

async function getAdmins(req, res) {
  try {
    const admins = adminService.findAll();
    sendSuccess(res, 'Admins retrieved', admins);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve admins', 500);
  }
}

module.exports = { createAdmin, getAdmins };
