require('dotenv').config();
const { run } = require('./src/database/db');

async function addInterviewerColumn() {
  try {
    console.log('[Migration] Adding interviewer column to candidates table...');

    // Check if column already exists
    const { get } = require('./src/database/db');
    const tableInfo = await get(`PRAGMA table_info(candidates)`);
    
    // Add interviewer column if it doesn't exist
    await run(`
      ALTER TABLE candidates 
      ADD COLUMN interviewer TEXT
    `);

    console.log('[Migration] ✓ Successfully added interviewer column');
    console.log('[Migration] Column stores the email of the team member conducting the interview');
    
    process.exit(0);
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('[Migration] ✓ Column already exists, skipping');
      process.exit(0);
    }
    console.error('[Migration] Error:', error.message);
    process.exit(1);
  }
}

addInterviewerColumn();
