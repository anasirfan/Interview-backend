const { google } = require('googleapis');
const { get } = require('../database/db');

class DriveWorker {
  constructor() {
    this.isRunning = false;
    this.scanInterval = null;
  }

  async getAuthenticatedDrive() {
    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );
    
    if (!admin || !admin.google_token || !admin.google_refresh) {
      console.log('[DriveWorker] No admin with Google OAuth tokens found');
      return null;
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

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    return { drive, admin };
  }

  async scanRecordings() {
    console.log('[DriveWorker] Scanning for Meet recordings...');
    
    const auth = await this.getAuthenticatedDrive();
    if (!auth) return [];

    const { drive } = auth;

    try {
      // Search for both video recordings and Google Docs (notes/transcripts)
      // Look for files that contain common meeting patterns
      const queries = [
        "mimeType='video/mp4'", // All video recordings
        "mimeType='application/vnd.google-apps.document' and (name contains 'Notes' or name contains 'Transcript')", // Google Docs notes
      ];

      const allFiles = [];
      
      for (const query of queries) {
        const response = await drive.files.list({
          q: query,
          fields: 'files(id, name, webViewLink, webContentLink, createdTime, size, mimeType)',
          orderBy: 'createdTime desc',
          pageSize: 100,
        });
        
        if (response.data.files) {
          allFiles.push(...response.data.files);
        }
      }

      console.log(`[DriveWorker] Found ${allFiles.length} Meet recordings and notes`);
      console.log(`[DriveWorker] Files:`, allFiles.map(f => ({ name: f.name, type: f.mimeType })));
      
      return allFiles;
    } catch (error) {
      console.error('[DriveWorker] Error scanning recordings:', error.message);
      return [];
    }
  }

  async fetchDocumentText(documentLink) {
    console.log('[DriveWorker] Fetching document text...');
    
    const auth = await this.getAuthenticatedDrive();
    if (!auth) return null;

    const { drive } = auth;

    try {
      // Extract document ID from various Google Docs URL formats
      let docId = null;
      if (documentLink.includes('/document/d/')) {
        docId = documentLink.split('/document/d/')[1].split('/')[0];
      } else if (documentLink.includes('id=')) {
        docId = documentLink.split('id=')[1].split('&')[0];
      }

      if (!docId) {
        console.error('[DriveWorker] Could not extract document ID from link:', documentLink);
        return null;
      }

      // Export Google Doc as plain text
      const response = await drive.files.export({
        fileId: docId,
        mimeType: 'text/plain',
      });

      const text = response.data;
      console.log(`[DriveWorker] Fetched document text (${text.length} chars)`);
      return text;
    } catch (error) {
      console.error('[DriveWorker] Error fetching document text:', error.message);
      return null;
    }
  }

  start(intervalMinutes = 30) {
    if (this.isRunning) {
      console.log('[DriveWorker] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`[DriveWorker] Started (scanning every ${intervalMinutes} minutes)`);

    this.scanInterval = setInterval(async () => {
      try {
        await this.scanRecordings();
      } catch (error) {
        console.error('[DriveWorker] Scan error:', error.message);
      }
    }, intervalMinutes * 60 * 1000);
  }

  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.isRunning = false;
    console.log('[DriveWorker] Stopped');
  }

  getStatus() {
    return { isRunning: this.isRunning };
  }
}

const driveWorker = new DriveWorker();

module.exports = { driveWorker, DriveWorker };
