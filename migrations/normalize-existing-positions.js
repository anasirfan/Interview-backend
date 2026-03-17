const { query, run } = require('../src/database/db');
const { normalizePosition } = require('../src/utils/position-normalizer');

async function normalizeExistingPositions() {
  try {
    console.log('Starting position normalization migration...');
    
    // Get all candidates
    const candidates = await query('SELECT id, position FROM candidates');
    
    console.log(`Found ${candidates.length} candidates to process`);
    
    let updated = 0;
    for (const candidate of candidates) {
      const normalizedPosition = normalizePosition(candidate.position);
      
      if (normalizedPosition !== candidate.position) {
        await run(
          'UPDATE candidates SET position = ? WHERE id = ?',
          [normalizedPosition, candidate.id]
        );
        console.log(`Updated: "${candidate.position}" -> "${normalizedPosition}"`);
        updated++;
      }
    }
    
    console.log(`\nMigration complete! Updated ${updated} out of ${candidates.length} candidates.`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

normalizeExistingPositions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
