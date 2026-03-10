const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

console.log('=== CHECKING NOTIFICATIONS ===\n');

db.all(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20`, [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(`Total notifications found: ${rows.length}\n`);
    rows.forEach((row, i) => {
      console.log(`${i + 1}. [${row.type}] ${row.title}`);
      console.log(`   Message: ${row.message}`);
      console.log(`   Candidate: ${row.candidate_name || 'N/A'}`);
      console.log(`   Read: ${row.is_read ? 'Yes' : 'No'}`);
      console.log(`   Created: ${row.created_at}`);
      console.log('');
    });
  }
  db.close();
});
