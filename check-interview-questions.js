const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Checking candidates with interview questions...\n');

db.all(`
  SELECT id, name, position, status 
  FROM candidates 
  WHERE interview_questions IS NOT NULL 
    AND interview_questions != ''
`, [], (err, rows) => {
  if (err) {
    console.error('Error:', err.message);
  } else {
    console.log('Candidates with interview questions:');
    console.log('=====================================\n');
    
    rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.name}`);
      console.log(`   Position: ${row.position}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   ID: ${row.id}\n`);
    });
    
    console.log(`Total: ${rows.length} candidates have interview questions\n`);
  }
  
  db.close();
});
