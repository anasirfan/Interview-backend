const { get } = require('./src/database/db');

async function checkAuth() {
  try {
    const admin = await get(
      'SELECT id, email, google_token, google_refresh FROM admins WHERE google_token IS NOT NULL LIMIT 1'
    );
    
    if (!admin) {
      console.log('❌ No admin with Google OAuth tokens found');
      console.log('👉 Please connect Google account from the dashboard');
      process.exit(1);
    }
    
    console.log('✅ Admin with Google tokens found:');
    console.log('   Email:', admin.email);
    console.log('   Has Access Token:', !!admin.google_token);
    console.log('   Has Refresh Token:', !!admin.google_refresh);
    console.log('   Token (first 20 chars):', admin.google_token?.substring(0, 20) + '...');
    
    // Try to use the token
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google/callback'
    );
    
    oauth2Client.setCredentials({
      access_token: admin.google_token,
      refresh_token: admin.google_refresh,
    });
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    console.log('\n🔍 Testing Drive API access...');
    try {
      const response = await drive.files.list({
        pageSize: 1,
        fields: 'files(id, name)',
      });
      console.log('✅ Drive API access successful!');
      console.log('   Files accessible:', response.data.files?.length || 0);
    } catch (error) {
      console.log('❌ Drive API access failed:', error.message);
      console.log('👉 Token may be expired. Please reconnect Google account from dashboard.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAuth();
