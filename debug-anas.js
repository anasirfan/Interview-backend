const { query } = require('./src/database/db');

async function debugAnas() {
  try {
    console.log('=== Checking Anas Irfan Data ===\n');
    
    const candidates = await query(`
      SELECT id, name, email, position, status, interview_date, meet_link, 
             meeting_recording, meeting_notes, round_stage, is_archived
      FROM candidates 
      WHERE name LIKE '%Anas%' OR email LIKE '%anas%'
    `);
    
    console.log('Found candidates:', candidates.length);
    candidates.forEach(c => {
      console.log('\n--- Candidate ---');
      console.log('ID:', c.id);
      console.log('Name:', c.name);
      console.log('Email:', c.email);
      console.log('Position:', c.position);
      console.log('Status:', c.status);
      console.log('Interview Date:', c.interview_date);
      console.log('Meet Link:', c.meet_link);
      console.log('Recording:', c.meeting_recording);
      console.log('Notes:', c.meeting_notes);
      console.log('Round Stage:', c.round_stage);
      console.log('Is Archived:', c.is_archived);
    });
    
    console.log('\n=== Checking Drive Files ===\n');
    const { driveWorker } = require('./src/workers/drive.worker');
    const files = await driveWorker.scanRecordings();
    
    console.log('Total files found:', files.length);
    const anasFiles = files.filter(f => f.name.includes('Anas'));
    console.log('Files with "Anas":', anasFiles.length);
    anasFiles.forEach(f => {
      console.log('  -', f.name);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugAnas();
