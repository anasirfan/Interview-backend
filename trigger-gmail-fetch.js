const axios = require('axios');

console.log('=== TRIGGERING GMAIL WORKER TO FETCH NEW MESSAGES ===\n');

axios.post('http://localhost:5000/api/cron/trigger/gmail', {}, {
  headers: {
    'Authorization': 'Bearer ' + process.env.ADMIN_TOKEN || ''
  }
})
.then(response => {
  console.log('✅ Gmail worker triggered successfully');
  console.log('Response:', response.data);
})
.catch(error => {
  console.error('❌ Failed to trigger Gmail worker');
  console.error('Error:', error.response?.data || error.message);
  console.log('\nNote: You may need to trigger this manually via the dashboard or ensure backend is running.');
});
