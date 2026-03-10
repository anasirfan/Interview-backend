const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

console.log('=== CLEARING OLD key_highlights DATA ===\n');

db.run(
  `UPDATE candidates SET key_highlights = NULL WHERE email = ?`,
  ['anasirfan101010@gmail.com'],
  function(err) {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('✅ Cleared key_highlights for anasirfan101010@gmail.com');
      console.log('Rows affected:', this.changes);
      console.log('\nNow ai_summary will be used instead of old key_highlights data.');
    }
    db.close();
  }
);
