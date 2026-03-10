require('dotenv').config();
const bcrypt = require('bcrypt');
const { run } = require('./src/database/db');

async function updatePassword() {
  try {
    console.log('[Password Update] Updating admin password...');

    const newPassword = 'LIMIAI123@';
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await run(
      'UPDATE admins SET password = ? WHERE email = ?',
      [hashedPassword, 'admin@limi.com']
    );

    console.log('[Password Update] ✓ Password updated successfully');
    console.log('[Password Update] Email: admin@limi.com');
    console.log('[Password Update] New Password: LIMIAI123@');
    console.log('[Password Update] Please use this password to login');
    
    process.exit(0);
  } catch (error) {
    console.error('[Password Update] Error:', error);
    process.exit(1);
  }
}

updatePassword();
