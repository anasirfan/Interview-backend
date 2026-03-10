const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

console.log('=== CHECKING ASSESSMENT LINKS IN DATABASE ===\n');

db.all(`
  SELECT 
    name,
    email,
    assessment_given,
    assessment_link,
    completed_link,
    status,
    round_stage
  FROM candidates 
  WHERE assessment_given = 1
  ORDER BY created_at DESC
`, [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  
  console.log(`Candidates with assessment_given = 1: ${rows.length}\n`);
  
  rows.forEach((row, i) => {
    console.log(`${i + 1}. ${row.name} (${row.email})`);
    console.log(`   Status: ${row.status} | Round: ${row.round_stage}`);
    console.log(`   Assessment Link: ${row.assessment_link || 'NULL'}`);
    console.log(`   Completed Link: ${row.completed_link || 'NULL'}`);
    console.log('');
  });
  
  const withLinks = rows.filter(r => r.assessment_link).length;
  const withCompleted = rows.filter(r => r.completed_link).length;
  
  console.log('\n=== SUMMARY ===');
  console.log(`Total with assessment_given: ${rows.length}`);
  console.log(`With assessment_link: ${withLinks}`);
  console.log(`With completed_link: ${withCompleted}`);
  
  db.close();
});
