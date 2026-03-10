const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

console.log('=== CHECKING MESSAGES ===\n');

db.all(`SELECT * FROM messages ORDER BY created_at DESC LIMIT 20`, [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(`Total messages found: ${rows.length}\n`);
    rows.forEach((row, i) => {
      console.log(`${i + 1}. [${row.direction}] ${row.subject}`);
      console.log(`   Candidate ID: ${row.candidate_id}`);
      console.log(`   Read: ${row.is_read ? 'Yes' : 'No'}`);
      console.log(`   Created: ${row.created_at}`);
      console.log(`   Body preview: ${row.body.substring(0, 100)}...`);
      console.log('');
    });
    
    console.log('\n=== UNREAD MESSAGE COUNT ===');
    db.get(`SELECT COUNT(*) as count FROM messages WHERE direction = 'RECEIVED' AND is_read = 0`, [], (err, row) => {
      if (err) {
        console.error('Error:', err);
      } else {
        console.log(`Unread messages: ${row.count}`);
      }
      db.close();
    });
  }
});
