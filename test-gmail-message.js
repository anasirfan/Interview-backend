require('dotenv').config();
const { google } = require('googleapis');
const { get } = require('./src/database/db');

function decodeBase64Url(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function testMessageFetch() {
  console.log('=== TESTING GMAIL MESSAGE FETCH ===\n');
  
  // Get admin credentials
  const admin = await get(
    'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
  );
  
  if (!admin?.google_token || !admin?.google_refresh) {
    console.error('No Google OAuth credentials found');
    return;
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google/callback'
  );
  
  oauth2Client.setCredentials({
    access_token: admin.google_token,
    refresh_token: admin.google_refresh,
  });
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  // Fetch the specific message
  const messageId = '19cbe95f585dbc65';
  
  console.log(`Fetching message: ${messageId}\n`);
  
  const fullMsg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  
  console.log('Message fetched successfully!\n');
  
  // Extract subject
  const subject = fullMsg.data.payload?.headers?.find(h => h.name === 'Subject')?.value || 'No Subject';
  console.log('Subject:', subject);
  console.log('Snippet:', fullMsg.data.snippet);
  console.log('Thread ID:', fullMsg.data.threadId);
  console.log('Internal Date:', fullMsg.data.internalDate);
  
  // Extract body
  const parts = fullMsg.data.payload?.parts || [];
  let bodyText = '';
  
  console.log('\nPayload structure:');
  console.log('- Has parts:', parts.length > 0);
  console.log('- Has direct body:', !!fullMsg.data.payload?.body?.data);
  
  // Recursive function to explore parts
  function exploreParts(parts, indent = '  ') {
    parts.forEach((part, i) => {
      console.log(`${indent}${i + 1}. mimeType: ${part.mimeType}, hasBody: ${!!part.body?.data}, size: ${part.body?.size || 0}`);
      if (part.parts && part.parts.length > 0) {
        console.log(`${indent}   Nested parts:`);
        exploreParts(part.parts, indent + '    ');
      }
    });
  }
  
  if (parts.length > 0) {
    console.log('\nParts:');
    exploreParts(parts);
  }
  
  // Recursive function to find text part
  function findTextPart(parts, mimeType) {
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return part;
      }
      if (part.parts && part.parts.length > 0) {
        const found = findTextPart(part.parts, mimeType);
        if (found) return found;
      }
    }
    return null;
  }
  
  // Try to extract body
  const textPart = findTextPart(parts, 'text/plain');
  if (textPart?.body?.data) {
    bodyText = decodeBase64Url(textPart.body.data).toString('utf-8');
    console.log('\n✅ Body extracted from text/plain part');
  } else if (fullMsg.data.payload?.body?.data) {
    bodyText = decodeBase64Url(fullMsg.data.payload.body.data).toString('utf-8');
    console.log('\n✅ Body extracted from direct payload.body');
  } else {
    console.log('\n❌ No text/plain body found!');
    
    // Try HTML part as fallback
    const htmlPart = findTextPart(parts, 'text/html');
    if (htmlPart?.body?.data) {
      bodyText = decodeBase64Url(htmlPart.body.data).toString('utf-8');
      console.log('✅ Body extracted from text/html part (fallback)');
    }
  }
  
  console.log('\n=== EXTRACTED BODY ===');
  console.log('Length:', bodyText.length);
  console.log('Content:');
  console.log(bodyText.slice(0, 500));
  console.log('======================\n');
  
  process.exit(0);
}

testMessageFetch().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
