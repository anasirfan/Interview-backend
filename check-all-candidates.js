const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

console.log('=== CHECKING ALL CANDIDATES DATA ===\n');

db.all(`
  SELECT 
    id,
    name,
    email,
    position,
    status,
    round_stage,
    assessment_given,
    assessment_link,
    completed_link,
    ai_score,
    ai_feedback,
    key_highlights,
    ai_summary,
    meeting_notes,
    rating
  FROM candidates 
  ORDER BY created_at DESC
`, [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
    db.close();
    return;
  }
  
  console.log(`Total candidates: ${rows.length}\n`);
  
  rows.forEach((row, i) => {
    console.log(`${i + 1}. ${row.name} (${row.email})`);
    console.log(`   Position: ${row.position}`);
    console.log(`   Status: ${row.status} | Round: ${row.round_stage}`);
    console.log(`   Assessment Given: ${row.assessment_given ? 'Yes' : 'No'}`);
    console.log(`   Assessment Link: ${row.assessment_link ? 'Yes' : 'No'}`);
    console.log(`   Completed Link: ${row.completed_link ? 'Yes' : 'No'}`);
    console.log(`   AI Score: ${row.ai_score || 'None'}`);
    console.log(`   AI Feedback: ${row.ai_feedback ? 'Yes' : 'No'}`);
    console.log(`   Key Highlights: ${row.key_highlights ? 'Yes' : 'No'}`);
    console.log(`   AI Summary: ${row.ai_summary ? 'Yes' : 'No'}`);
    console.log(`   Meeting Notes: ${row.meeting_notes ? 'Yes' : 'No'}`);
    console.log(`   Rating: ${row.rating || 'None'}`);
    console.log('');
  });
  
  const withAssessment = rows.filter(r => r.assessment_given).length;
  const withCompletedLink = rows.filter(r => r.completed_link).length;
  const withAiScore = rows.filter(r => r.ai_score).length;
  const withAiSummary = rows.filter(r => r.ai_summary).length;
  const withMeetingNotes = rows.filter(r => r.meeting_notes).length;
  
  console.log('\n=== SUMMARY ===');
  console.log(`Total candidates: ${rows.length}`);
  console.log(`With assessment given: ${withAssessment}`);
  console.log(`With completed link: ${withCompletedLink}`);
  console.log(`With AI score: ${withAiScore}`);
  console.log(`With AI summary: ${withAiSummary}`);
  console.log(`With meeting notes: ${withMeetingNotes}`);
  
  db.close();
});
