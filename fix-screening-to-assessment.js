const { query, run } = require('./src/database/db');

async function fixScreeningToAssessment() {
  console.log('='.repeat(60));
  console.log('FIX SCREENING → ASSESSMENT STATUS');
  console.log('='.repeat(60));
  console.log('');
  
  try {
    // Find all candidates with SCREENING status
    const screeningCandidates = await query(`
      SELECT id, name, email, status, round_stage
      FROM candidates 
      WHERE status = 'SCREENING' OR round_stage = 'SCREENING'
    `);

    console.log(`Found ${screeningCandidates.length} candidates with SCREENING status`);
    console.log('');

    if (screeningCandidates.length === 0) {
      console.log('✅ No candidates to update');
      process.exit(0);
    }

    console.log('Candidates to update:');
    screeningCandidates.forEach(c => {
      console.log(`  - ${c.name} (${c.email}) - Status: ${c.status}, Round: ${c.round_stage}`);
    });
    console.log('');

    // Update all to ASSESSMENT
    const result = await run(`
      UPDATE candidates 
      SET status = 'ASSESSMENT',
          round_stage = 'ASSESSMENT',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'SCREENING' OR round_stage = 'SCREENING'
    `);

    console.log('');
    console.log('✅ SUCCESS!');
    console.log(`   Updated ${result.changes} candidates from SCREENING to ASSESSMENT`);
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
  }
  
  console.log('');
  console.log('='.repeat(60));
  process.exit(0);
}

fixScreeningToAssessment();
