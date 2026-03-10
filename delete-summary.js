const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.run(
  `UPDATE candidates SET ai_summary = NULL WHERE email = ?`,
  ['anasirfan101010@gmail.com'],
  function(err) {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('✅ AI summary deleted for anasirfan101010@gmail.com');
      console.log('Rows affected:', this.changes);
    }
    db.close();
  }
);
