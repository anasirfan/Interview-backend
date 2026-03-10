const { gmailWorker } = require('./src/workers/gmail.worker');

async function markAllEmailsAsRead() {
  console.log('='.repeat(60));
  console.log('MARK ALL EMAILS AS READ SCRIPT');
  console.log('='.repeat(60));
  console.log('');
  
  try {
    const result = await gmailWorker.markAllPreviousEmailsAsRead();
    
    if (result.success) {
      console.log('');
      console.log('✅ SUCCESS!');
      console.log(`   Marked ${result.marked} out of ${result.total} emails as read`);
    } else {
      console.log('');
      console.log('❌ FAILED!');
      console.log(`   Error: ${result.message}`);
    }
  } catch (error) {
    console.error('');
    console.error('❌ ERROR:', error.message);
  }
  
  console.log('');
  console.log('='.repeat(60));
  process.exit(0);
}

markAllEmailsAsRead();
