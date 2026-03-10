const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Clearing interview questions for all candidates...\n');

db.run(`
  UPDATE candidates 
  SET interview_questions = NULL 
  WHERE interview_questions IS NOT NULL 
    AND interview_questions != ''
`, function(err) {
  if (err) {
    console.error('❌ Error:', err.message);
  } else {
    console.log(`✅ Successfully cleared interview questions for ${this.changes} candidates\n`);
    console.log('Candidates affected:');
    console.log('- Sameer John');
    console.log('- MOAZ AKRAM KHAN');
    console.log('- Shaheryar Ali');
    console.log('\nYou can now regenerate interview questions for these candidates.');
  }
  
  db.close();
});
