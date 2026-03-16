const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  console.log('Adding assessment automation fields...');

  // Add automation settings table
  db.run(`
    CREATE TABLE IF NOT EXISTS automation_settings (
      id TEXT PRIMARY KEY,
      mode TEXT DEFAULT 'off',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating automation_settings table:', err);
    } else {
      console.log('✓ automation_settings table created');
      
      // Insert default settings
      db.run(`
        INSERT OR IGNORE INTO automation_settings (id, mode)
        VALUES ('global', 'off')
      `, (err) => {
        if (err) {
          console.error('Error inserting default settings:', err);
        } else {
          console.log('✓ Default automation settings inserted');
        }
      });
    }
  });

  // Add assessment automation fields to candidates table
  db.run(`
    ALTER TABLE candidates ADD COLUMN assessment_status TEXT DEFAULT NULL
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding assessment_status:', err);
    } else {
      console.log('✓ assessment_status column added');
    }
  });

  db.run(`
    ALTER TABLE candidates ADD COLUMN assessment_generated_at DATETIME DEFAULT NULL
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding assessment_generated_at:', err);
    } else {
      console.log('✓ assessment_generated_at column added');
    }
  });

  db.run(`
    ALTER TABLE candidates ADD COLUMN assessment_sent_at DATETIME DEFAULT NULL
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding assessment_sent_at:', err);
    } else {
      console.log('✓ assessment_sent_at column added');
    }
  });

  db.run(`
    ALTER TABLE candidates ADD COLUMN assessment_retry_count INTEGER DEFAULT 0
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding assessment_retry_count:', err);
    } else {
      console.log('✓ assessment_retry_count column added');
    }
  });

  db.run(`
    ALTER TABLE candidates ADD COLUMN automation_mode TEXT DEFAULT NULL
  `, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('Error adding automation_mode:', err);
    } else {
      console.log('✓ automation_mode column added (per-candidate override)');
    }
  });

  console.log('\n✅ Migration completed successfully!');
});

db.close();
