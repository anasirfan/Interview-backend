const express = require('express');
const { createAdmin, getAdmins } = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middlewares/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', authorize('SUPER_ADMIN'), createAdmin);
router.get('/', authorize('SUPER_ADMIN', 'HR_ADMIN'), getAdmins);

module.exports = router;
