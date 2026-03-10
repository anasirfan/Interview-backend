require('dotenv').config();
const bcrypt = require('bcrypt');
const { get, run } = require('../database/db');
const { generateUUID } = require('../utils/uuid');

async function seed() {
  try {
    console.log('[Seed] Starting database seeding...');

    // Wait for database to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if admin already exists
    const existing = await get('SELECT id FROM admins WHERE email = ?', ['admin@limi.com']);
    
    if (existing) {
      console.log('[Seed] Admin user already exists. Skipping seed.');
      process.exit(0);
    }

    // Create default admin
    const hashedPassword = await bcrypt.hash('LIMIAI123@', 12);
    const adminId = generateUUID();

    await run(`
      INSERT INTO admins (id, name, email, password, role)
      VALUES (?, ?, ?, ?, ?)
    `, [adminId, 'Super Admin', 'admin@limi.com', hashedPassword, 'SUPER_ADMIN']);

    console.log('[Seed] ✓ Created Super Admin');
    console.log('[Seed] Email: admin@limi.com');
    console.log('[Seed] Password: LIMIAI123@');
    console.log('[Seed] ⚠️  Please change the password after first login!');
    console.log('[Seed] Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[Seed] Error:', error);
    process.exit(1);
  }
}

seed();
