const { run, get } = require('../src/database/db');

async function migrate() {
  try {
    console.log('Starting migration: add-refresh-tokens-table...');

    // Create refresh_tokens table for multiple device support
    await run(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        device_info TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
      )
    `);

    console.log('✓ Created refresh_tokens table');

    // Create index for faster lookups
    await run(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_admin_id 
      ON refresh_tokens(admin_id)
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token 
      ON refresh_tokens(token)
    `);

    console.log('✓ Created indexes on refresh_tokens table');

    // Migrate existing refresh tokens from admins table
    const adminsWithTokens = await get(`
      SELECT id, refresh_token 
      FROM admins 
      WHERE refresh_token IS NOT NULL
    `, [], true); // true = get all rows

    if (adminsWithTokens && adminsWithTokens.length > 0) {
      const { generateUUID } = require('../src/utils/uuid');
      
      for (const admin of adminsWithTokens) {
        const tokenId = generateUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

        await run(`
          INSERT INTO refresh_tokens (id, admin_id, token, device_info, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `, [tokenId, admin.id, admin.refresh_token, 'Legacy Device', expiresAt.toISOString()]);
      }

      console.log(`✓ Migrated ${adminsWithTokens.length} existing refresh tokens`);
    }

    // Optional: Keep refresh_token column in admins table for backward compatibility
    // Or remove it if you want to fully migrate
    console.log('Note: refresh_token column in admins table kept for backward compatibility');

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

migrate();
