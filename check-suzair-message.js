const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

console.log('=== CHECKING SUZAIR MESSAGE ===\n');

db.get(`
  SELECT * FROM messages 
  WHERE gmail_message_id = '19cbe95f585dbc65'
`, [], (err, row) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  
  if (!row) {
    console.log('Message not found!');
    db.close();
    return;
  }
  
  console.log('Message Details:');
  console.log('ID:', row.id);
  console.log('Candidate ID:', row.candidate_id);
  console.log('Gmail Message ID:', row.gmail_message_id);
  console.log('Direction:', row.direction);
  console.log('Subject:', row.subject);
  console.log('Body:', row.body);
  console.log('Body Length:', row.body ? row.body.length : 0);
  console.log('Is Read:', row.is_read);
  console.log('Created At:', row.created_at);
  
  db.close();
});
