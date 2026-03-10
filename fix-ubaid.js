const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

console.log('=== FIXING UBAID DATA ===\n');

// Fix email and revert to SHORTLISTED status
db.run(`
  UPDATE candidates 
  SET 
    email = 'ubaidnadeem26@gmail.com',
    status = 'SHORTLISTED',
    round_stage = 'SHORTLISTED',
    interview_date = NULL,
    meet_link = NULL,
    calendar_event_id = NULL
  WHERE name LIKE '%Ubaid%'
`, function(err) {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  
  console.log('✅ Fixed Ubaid data:');
  console.log('- Email cleaned to: ubaidnadeem26@gmail.com');
  console.log('- Status reverted to: SHORTLISTED');
  console.log('- Round stage reverted to: SHORTLISTED');
  console.log('- Cleared interview_date, meet_link, calendar_event_id');
  console.log('Rows affected:', this.changes);
  
  db.close();
});
