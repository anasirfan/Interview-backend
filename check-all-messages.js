const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

console.log('=== CHECKING ALL MESSAGES FOR anasirfan101010@gmail.com ===\n');

// First get candidate ID
db.get(`SELECT id, name FROM candidates WHERE email = ?`, ['anasirfan101010@gmail.com'], (err, candidate) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  
  if (!candidate) {
    console.log('Candidate not found!');
    db.close();
    return;
  }
  
  console.log(`Candidate: ${candidate.name} (${candidate.id})\n`);
  
  // Get all messages for this candidate
  db.all(`SELECT * FROM messages WHERE candidate_id = ? ORDER BY created_at ASC`, [candidate.id], (err, rows) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log(`Total messages found: ${rows.length}\n`);
      console.log('=== MESSAGE HISTORY ===\n');
      
      rows.forEach((row, i) => {
        console.log(`${i + 1}. [${row.direction}] ${row.subject}`);
        console.log(`   Gmail ID: ${row.gmail_message_id}`);
        console.log(`   Read: ${row.is_read ? 'Yes' : 'No'}`);
        console.log(`   Created: ${row.created_at}`);
        console.log(`   Body preview: ${row.body.substring(0, 150)}...`);
        console.log('');
      });
      
      const sentCount = rows.filter(r => r.direction === 'SENT').length;
      const receivedCount = rows.filter(r => r.direction === 'RECEIVED').length;
      const unreadCount = rows.filter(r => r.direction === 'RECEIVED' && r.is_read === 0).length;
      
      console.log('\n=== SUMMARY ===');
      console.log(`Total messages: ${rows.length}`);
      console.log(`Sent by you: ${sentCount}`);
      console.log(`Received from candidate: ${receivedCount}`);
      console.log(`Unread received: ${unreadCount}`);
    }
    db.close();
  });
});
