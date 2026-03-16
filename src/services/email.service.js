const { google } = require('googleapis');
const logger = require('./logger.service');
const { query } = require('../database/db');

class EmailService {
  async getOAuth2Client() {
    // Get OAuth tokens from admin table (first admin with Google tokens)
    const admins = await query('SELECT * FROM admins WHERE google_token IS NOT NULL LIMIT 1');
    
    if (!admins || admins.length === 0) {
      throw new Error('No Google OAuth tokens found. Please authenticate with Google first via /api/google/auth');
    }

    const admin = admins[0];
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google/callback'
    );

    oauth2Client.setCredentials({
      access_token: admin.google_token,
      refresh_token: admin.google_refresh,
    });

    // Handle token refresh
    oauth2Client.on('tokens', async (newTokens) => {
      if (newTokens.refresh_token) {
        await query(
          'UPDATE admins SET google_token = ?, google_refresh = ? WHERE id = ?',
          [newTokens.access_token, newTokens.refresh_token, admin.id]
        );
      } else {
        await query(
          'UPDATE admins SET google_token = ? WHERE id = ?',
          [newTokens.access_token, admin.id]
        );
      }
    });

    return oauth2Client;
  }

  async sendEmail({ to, subject, body, attachments = [] }) {
    try {
      const auth = await this.getOAuth2Client();
      const gmail = google.gmail({ version: 'v1', auth });
      const fs = require('fs');

      // Build email message
      let message = '';
      
      if (attachments.length > 0) {
        // Multipart message with attachments
        const boundary = '----=_Part_' + Math.random().toString(36).substring(2);
        
        const messageParts = [];
        
        // Email headers
        messageParts.push(`To: ${to}`);
        messageParts.push(`Subject: ${subject}`);
        messageParts.push(`MIME-Version: 1.0`);
        messageParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
        messageParts.push('');
        
        // Text body part
        messageParts.push(`--${boundary}`);
        messageParts.push(`Content-Type: text/plain; charset="UTF-8"`);
        messageParts.push(`Content-Transfer-Encoding: 7bit`);
        messageParts.push('');
        messageParts.push(body);
        messageParts.push('');

        // Add attachments
        for (const attachment of attachments) {
          if (fs.existsSync(attachment.path)) {
            const fileContent = fs.readFileSync(attachment.path);
            const base64File = fileContent.toString('base64');
            
            // Split base64 into 76-character lines (RFC 2045)
            const base64Lines = base64File.match(/.{1,76}/g) || [];
            
            messageParts.push(`--${boundary}`);
            messageParts.push(`Content-Type: ${attachment.mimeType || 'application/octet-stream'}; name="${attachment.filename}"`);
            messageParts.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
            messageParts.push(`Content-Transfer-Encoding: base64`);
            messageParts.push('');
            messageParts.push(...base64Lines);
            messageParts.push('');
          } else {
            logger.error('EMAIL', 'Attachment file not found', { path: attachment.path });
          }
        }

        messageParts.push(`--${boundary}--`);
        message = messageParts.join('\r\n');
      } else {
        // Simple text email
        message = [
          `To: ${to}`,
          `Subject: ${subject}`,
          `Content-Type: text/plain; charset=utf-8`,
          '',
          body
        ].join('\r\n');
      }

      // Encode message
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Send email
      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      logger.emailSent(to, subject, {
        messageId: result.data.id,
        hasAttachments: attachments.length > 0,
        attachmentCount: attachments.length
      });

      return {
        success: true,
        messageId: result.data.id,
        threadId: result.data.threadId
      };
    } catch (error) {
      logger.emailFailed(to, subject, error, {
        errorCode: error.code,
        errorMessage: error.message
      });
      throw error;
    }
  }

  async sendEmailWithAttachment({ to, subject, body, attachmentPath, attachmentName }) {
    const path = require('path');
    const filename = attachmentName || path.basename(attachmentPath);
    
    // Determine MIME type
    let mimeType = 'application/octet-stream';
    if (filename.toLowerCase().endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (filename.toLowerCase().endsWith('.zip')) {
      mimeType = 'application/zip';
    } else if (filename.toLowerCase().endsWith('.doc') || filename.toLowerCase().endsWith('.docx')) {
      mimeType = 'application/msword';
    }
    
    const attachments = [{
      filename,
      path: attachmentPath,
      mimeType
    }];
    
    logger.info('EMAIL', 'Sending email with attachment', {
      to,
      filename,
      mimeType
    });

    return this.sendEmail({
      to,
      subject,
      body,
      attachments
    });
  }

  async sendAssessmentEmail({ candidateEmail, candidateName, subject, body, attachmentPath = null, attachmentFilename = null }) {
    const attachments = [];
    
    if (attachmentPath) {
      const path = require('path');
      // Use original filename if provided, otherwise use basename
      const filename = attachmentFilename || path.basename(attachmentPath);
      
      // Determine MIME type from filename extension
      let mimeType = 'application/octet-stream';
      if (filename.toLowerCase().endsWith('.pdf')) {
        mimeType = 'application/pdf';
      } else if (filename.toLowerCase().endsWith('.zip')) {
        mimeType = 'application/zip';
      } else if (filename.toLowerCase().endsWith('.doc') || filename.toLowerCase().endsWith('.docx')) {
        mimeType = 'application/msword';
      }
      
      attachments.push({
        filename,
        path: attachmentPath,
        mimeType
      });
      
      logger.info('EMAIL', 'Preparing attachment', {
        filename,
        path: attachmentPath,
        mimeType
      });
    }

    return this.sendEmail({
      to: candidateEmail,
      subject,
      body,
      attachments
    });
  }
}

module.exports = new EmailService();
