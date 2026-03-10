const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Adding interview_questions column to candidates table...');

db.run(`ALTER TABLE candidates ADD COLUMN interview_questions TEXT`, (err) => {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✅ Column already exists - no action needed');
    } else {
      console.error('❌ Error adding column:', err.message);
    }
  } else {
    console.log('✅ Successfully added interview_questions column');
  }
  
  db.close(() => {
    console.log('Database connection closed');
  });
});
