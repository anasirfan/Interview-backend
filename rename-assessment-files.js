const fs = require('fs');
const path = require('path');
const { query } = require('./src/database/db');

async function renameAssessmentFiles() {
  console.log('='.repeat(60));
  console.log('RENAME ASSESSMENT FILES - ADD .PDF EXTENSION');
  console.log('='.repeat(60));
  console.log('');
  
  try {
    const assessmentsDir = path.join(__dirname, 'uploads', 'assessments');
    
    // Get all files in assessments directory
    const files = fs.readdirSync(assessmentsDir);
    console.log(`Found ${files.length} files in assessments directory`);
    console.log('');
    
    let renamed = 0;
    let skipped = 0;
    
    for (const file of files) {
      const filePath = path.join(assessmentsDir, file);
      const stats = fs.statSync(filePath);
      
      // Skip if it's a directory
      if (stats.isDirectory()) {
        continue;
      }
      
      // Skip if file already has .pdf extension
      if (file.endsWith('.pdf')) {
        console.log(`⏭️  Skipped: ${file} (already has .pdf extension)`);
        skipped++;
        continue;
      }
      
      // Rename file by adding .pdf extension
      const newFileName = file + '.pdf';
      const newFilePath = path.join(assessmentsDir, newFileName);
      
      fs.renameSync(filePath, newFilePath);
      console.log(`✅ Renamed: ${file} → ${newFileName}`);
      renamed++;
      
      // Update database records
      await query(`
        UPDATE candidates 
        SET assessment_link = ?
        WHERE assessment_link = ?
      `, [newFileName, file]);
    }
    
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ COMPLETE!');
    console.log(`   Renamed: ${renamed} files`);
    console.log(`   Skipped: ${skipped} files`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
  }
  
  process.exit(0);
}

renameAssessmentFiles();
