const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

console.log('=== CHECKING UBAID DATA ===\n');

db.get(`
  SELECT * FROM candidates 
  WHERE name LIKE '%Ubaid%'
`, [], (err, row) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  
  if (!row) {
    console.log('Ubaid not found!');
    db.close();
    return;
  }
  
  console.log('Candidate Data:');
  console.log('ID:', row.id);
  console.log('Name:', row.name);
  console.log('Email:', row.email);
  console.log('Status:', row.status);
  console.log('Round Stage:', row.round_stage);
  console.log('Assessment Given:', row.assessment_given);
  console.log('Assessment Link:', row.assessment_link);
  console.log('Interview Date:', row.interview_date);
  console.log('Meet Link:', row.meet_link);
  console.log('Calendar Event ID:', row.calendar_event_id);
  console.log('Meeting Recording:', row.meeting_recording);
  console.log('Meeting Notes:', row.meeting_notes);
  console.log('Gmail Thread ID:', row.gmail_thread_id);
  console.log('');
  
  db.close();
});
