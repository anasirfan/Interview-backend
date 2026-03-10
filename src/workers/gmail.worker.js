const { google } = require('googleapis');
const { get, run } = require('../database/db');
const fs = require('fs');
const path = require('path');
const { aiProcessor } = require('./ai.processor');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google/callback';
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
}

async function exchangeCode(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

function parseFromHeader(from) {
  const match = from.match(/^(?:"?([^"]*)"?\s*)?<([^>]+@[^>]+)>?$/);
  if (match) return { name: match[1]?.trim() || match[2].split('@')[0], email: match[2].trim() };
  return { name: from.split('@')[0], email: from };
}

function decodeBase64Url(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

class GmailWorker {
  constructor() {
    this.isRunning = false;
  }

  async getAuthenticatedGmail() {
    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );
    
    if (!admin || !admin.google_token || !admin.google_refresh) {
      console.log('[GmailWorker] No admin with Google OAuth tokens found. Skipping.');
      return null;
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: admin.google_token,
      refresh_token: admin.google_refresh,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await run('UPDATE admins SET google_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
          [tokens.access_token, admin.id]);
      }
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    return { gmail, admin };
  }

  async markAllPreviousEmailsAsRead() {
    console.log('[GmailWorker] Marking all previous emails as read...');
    
    const auth = await this.getAuthenticatedGmail();
    if (!auth) return { success: false, message: 'No OAuth tokens' };

    const { gmail } = auth;

    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 500,
      });

      const messages = listRes.data.messages || [];
      console.log(`[GmailWorker] Found ${messages.length} unread emails to mark as read`);

      let marked = 0;
      for (const msg of messages) {
        try {
          await gmail.users.messages.modify({
            userId: 'me',
            id: msg.id,
            requestBody: {
              removeLabelIds: ['UNREAD'],
            },
          });
          marked++;
        } catch (err) {
          console.error(`[GmailWorker] Failed to mark ${msg.id} as read:`, err.message);
        }
      }

      console.log(`[GmailWorker] Successfully marked ${marked}/${messages.length} emails as read`);
      return { success: true, marked, total: messages.length };
    } catch (error) {
      console.error('[GmailWorker] Error marking emails as read:', error.message);
      return { success: false, message: error.message };
    }
  }

  async fetchNewEmails() {
    const auth = await this.getAuthenticatedGmail();
    if (!auth) return [];

    const { gmail } = auth;

    // Fetch ALL unread emails with attachments (no time limit)
    const query = `is:unread has:attachment`;
    
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });

    const messages = listRes.data.messages || [];
    console.log(`[GmailWorker] Found ${messages.length} unread messages with attachments`);

    const processed = [];

    for (const msg of messages) {
      if (!msg.id) continue;

      const existing = await get('SELECT id FROM candidates WHERE gmail_thread_id = ?', [msg.id]);
      if (existing) continue;

      try {
        const fullMsg = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        const headers = fullMsg.data.payload?.headers || [];
        const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
        const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';

        const { name, email } = parseFromHeader(from);

        const parts = fullMsg.data.payload?.parts || [];
        let cvFilename = null;
        let hasAssessment = false;
        const subjectLower = subject.toLowerCase();

        if (subjectLower.includes('assessment') || subjectLower.includes('test') || subjectLower.includes('assignment')) {
          hasAssessment = true;
        }

        let cvText = '';
        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            const mimeType = part.mimeType || '';
            if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('document') || part.filename.match(/\.(pdf|doc|docx)$/i)) {
              const attachRes = await gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: msg.id,
                id: part.body.attachmentId,
              });

              if (attachRes.data.data) {
                const buffer = decodeBase64Url(attachRes.data.data);
                const safeName = `cv-${Date.now()}-${part.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const uploadPath = path.join(process.cwd(), 'uploads', safeName);
                fs.writeFileSync(uploadPath, buffer);
                cvFilename = safeName;

                try {
                  if (part.filename.toLowerCase().endsWith('.pdf')) {
                    console.log(`[GmailWorker] Extracting text from PDF: ${part.filename}`);
                    const pdfParse = require('pdf-parse');
                    const pdfData = await pdfParse(buffer);
                    cvText = pdfData.text;
                    console.log(`[GmailWorker] Extracted ${cvText.length} characters from PDF`);
                  }
                } catch (e) {
                  console.error('[GmailWorker] PDF text extraction error:', e.message);
                }
              }
            }
          }
        }

        let bodyText = '';
        const textPart = parts.find(p => p.mimeType === 'text/plain');
        if (textPart?.body?.data) {
          bodyText = decodeBase64Url(textPart.body.data).toString('utf-8').slice(0, 2000);
        }

        let candidateName = name;
        let candidateEmail = email;
        let candidatePhone = '';

        if (cvText && cvText.length > 50) {
          console.log(`[GmailWorker] CV text available (${cvText.length} chars), attempting AI extraction...`);
          try {
            const contactInfo = await aiProcessor.extractContactInfo(cvText);
            if (contactInfo && contactInfo.name && contactInfo.email) {
              candidateName = contactInfo.name;
              candidateEmail = contactInfo.email;
              candidatePhone = contactInfo.phone || '';
              console.log(`[GmailWorker] ✅ AI extracted from CV: ${candidateName} <${candidateEmail}>`);
            }
          } catch (e) {
            console.error('[GmailWorker] ❌ AI contact extraction failed:', e.message);
          }
        }

        let status = 'INBOX';
        if (hasAssessment) status = 'ASSESSMENT';

        const existingCandidate = await get('SELECT * FROM candidates WHERE email = ?', [candidateEmail]);
        
        if (existingCandidate) {
          await run(`
            UPDATE candidates 
            SET gmail_thread_id = ?, 
                ${hasAssessment ? 'status = ?, round_stage = ?, assessment_given = 1,' : ''}
                ${cvFilename && !existingCandidate.cv_path ? 'cv_path = ?,' : ''}
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [
            msg.id,
            ...(hasAssessment ? ['ASSESSMENT', 'ASSESSMENT'] : []),
            ...(cvFilename && !existingCandidate.cv_path ? [cvFilename] : []),
            existingCandidate.id
          ].filter(Boolean));
          console.log(`[GmailWorker] Updated existing candidate: ${candidateEmail}`);
        } else {
          let position = 'Intern - General';
          const combinedText = `${subject} ${bodyText}`.toLowerCase();
          
          if (combinedText.match(/\b(devops|dev\s*ops|infrastructure|deployment|ci\s*cd|docker|kubernetes)\b/i)) {
            position = 'Intern - DevOps';
          } else if (combinedText.match(/\b(ai|artificial\s*intelligence|machine\s*learning|ml|deep\s*learning|nlp|computer\s*vision)\b/i)) {
            position = 'Intern - AI Engineer';
          } else if (combinedText.match(/\b(full\s*stack|fullstack|mern|mean|frontend|backend|web\s*dev)\b/i)) {
            position = 'Intern - Full Stack Developer';
          } else if (combinedText.match(/\b(frontend|front\s*end|react|vue|angular|ui|ux)\b/i)) {
            position = 'Intern - Frontend Developer';
          } else if (combinedText.match(/\b(backend|back\s*end|node|python|java|api|server)\b/i)) {
            position = 'Intern - Backend Developer';
          } else if (combinedText.match(/\b(data\s*scien|data\s*analy|analytics|pandas|numpy|visualization)\b/i)) {
            position = 'Intern - Data Scientist';
          } else if (combinedText.match(/\b(mobile|android|ios|react\s*native|flutter)\b/i)) {
            position = 'Intern - Mobile Developer';
          } else if (combinedText.match(/\b(qa|quality|test|automation|selenium)\b/i)) {
            position = 'Intern - QA Engineer';
          }

          const candidateId = require('../utils/uuid').generateUUID();
          
          await run(`
            INSERT INTO candidates (
              id, name, email, phone, position, status, round_stage, cv_path, 
              gmail_thread_id, assessment_given, remarks
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            candidateId,
            candidateName,
            candidateEmail,
            candidatePhone || null,
            position,
            status,
            status,
            cvFilename,
            msg.id,
            hasAssessment ? 1 : 0,
            bodyText.slice(0, 500) || null
          ]);

          if (cvFilename && cvText) {
            try {
              const analysis = await aiProcessor.analyzeCandidate(candidateName, position, cvText);
              if (analysis.highlights) {
                const aiPosition = analysis.highlights.desired_role || position;
                await run(`
                  UPDATE candidates 
                  SET key_highlights = ?, 
                      position = ?,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `, [
                  JSON.stringify(analysis.highlights),
                  aiPosition.includes('Intern') ? aiPosition : `Intern - ${aiPosition}`,
                  candidateId
                ]);
              }
            } catch (e) {
              console.error('[GmailWorker] AI analysis failed for', candidateName);
            }
          }

          console.log(`[GmailWorker] Created candidate: ${candidateName} <${candidateEmail}> [${status}]`);
        }

        try {
          await gmail.users.messages.modify({
            userId: 'me',
            id: msg.id,
            requestBody: {
              removeLabelIds: ['UNREAD'],
            },
          });
          console.log(`[GmailWorker] Marked email ${msg.id} as read`);
        } catch (markErr) {
          console.error(`[GmailWorker] Failed to mark email as read:`, markErr.message);
        }

        processed.push(msg.id);
      } catch (msgErr) {
        console.error(`[GmailWorker] Error processing message ${msg.id}:`, msgErr.message);
      }
    }

    console.log(`[GmailWorker] Processed ${processed.length} new messages`);
    return processed;
  }

  async sendReply(candidateEmail, subject, body) {
    const auth = await this.getAuthenticatedGmail();
    if (!auth) throw new Error('No OAuth tokens');

    const { gmail } = auth;

    const raw = Buffer.from(
      `To: ${candidateEmail}\r\n` +
      `Subject: Re: ${subject}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      body
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    console.log(`[GmailWorker] Email sent to ${candidateEmail}`);
  }

  async checkAssessmentReplies() {
    console.log('[GmailWorker] Checking for assessment replies...');
    
    const auth = await this.getAuthenticatedGmail();
    if (!auth) return [];

    const { gmail } = auth;

    const { query: dbQuery } = require('../database/db');
    // Check all candidates who have been sent assessments, regardless of current stage
    // This allows us to capture follow-up messages and second replies
    const candidates = await dbQuery(`
      SELECT * FROM candidates 
      WHERE assessment_given = 1 
        AND is_archived = 0
    `);

    console.log(`[GmailWorker] Checking replies for ${candidates.length} candidates`);

    for (const candidate of candidates) {
      try {
        const searchRes = await gmail.users.messages.list({
          userId: 'me',
          q: `from:${candidate.email} after:2026/02/02`,
          maxResults: 10,
        });

        const messages = searchRes.data.messages || [];
        
        for (const msg of messages) {
          if (!msg.id) continue;

          const fullMsg = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });

          // Recursive function to find text part in nested multipart structures
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

          const parts = fullMsg.data.payload?.parts || [];
          let bodyText = '';
          
          // Try to find text/plain part recursively
          const textPart = findTextPart(parts, 'text/plain');
          if (textPart?.body?.data) {
            bodyText = decodeBase64Url(textPart.body.data).toString('utf-8');
          } else if (fullMsg.data.payload?.body?.data) {
            bodyText = decodeBase64Url(fullMsg.data.payload.body.data).toString('utf-8');
          } else {
            // Fallback to HTML part if text/plain not found
            const htmlPart = findTextPart(parts, 'text/html');
            if (htmlPart?.body?.data) {
              bodyText = decodeBase64Url(htmlPart.body.data).toString('utf-8');
            }
          }
          
          // If body is still empty or very short, use snippet as fallback
          if (!bodyText || bodyText.trim().length < 3) {
            bodyText = fullMsg.data.snippet || bodyText;
          }

          const linkRegex = /(https?:\/\/[^\s]+)/gi;
          const links = bodyText.match(linkRegex) || [];
          const hasSubmissionLink = links.some(link => 
            link.includes('github.com') || 
            link.includes('vercel.app') || 
            link.includes('netlify.app') ||
            link.includes('demo') ||
            link.includes('youtube.com') ||
            link.includes('drive.google.com')
          );

          const logger = require('../services/logger.service');
          const { v4: uuidv4 } = require('uuid');
          
          // Only update status if candidate is still in ASSESSMENT stage AND has submission link
          if (hasSubmissionLink && candidate.round_stage === 'ASSESSMENT') {
            await dbQuery(`
              UPDATE candidates 
              SET completed_link = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [links.join(', '), candidate.id]);
          }
          
          // ALWAYS store ALL messages in database (not just those with links)
          const subject = fullMsg.data.payload?.headers?.find(h => h.name === 'Subject')?.value || 'Message';
          
          // Check if message already exists to avoid duplicates
          const existingMsg = await dbQuery(`
            SELECT id FROM messages WHERE gmail_message_id = ?
          `, [msg.id]);
          
          if (existingMsg.length === 0) {
            await dbQuery(`
              INSERT INTO messages (id, candidate_id, gmail_message_id, direction, subject, body, is_read, created_at)
              VALUES (?, ?, ?, 'RECEIVED', ?, ?, 0, CURRENT_TIMESTAMP)
            `, [uuidv4(), candidate.id, msg.id, subject, bodyText]);
            
            // Create notification for new message
            await dbQuery(`
              INSERT INTO notifications (id, type, title, message, candidate_id, candidate_name, is_read, created_at)
              VALUES (?, 'MESSAGE', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
            `, [
              uuidv4(),
              `New Message: ${candidate.name}`,
              `${candidate.name} sent a message`,
              candidate.id,
              candidate.name
            ]);
            
            logger.success('MESSAGE_RECEIVED', `Message received from ${candidate.name}`, {
              candidateId: candidate.id,
              email: candidate.email,
              hasLinks: links.length > 0
            });
            
            console.log(`[GmailWorker] Message from ${candidate.name} stored`);
          }
        }
      } catch (err) {
        console.error(`[GmailWorker] Error checking replies for ${candidate.email}:`, err.message);
      }
    }
  }

  start() {
    if (this.isRunning) {
      console.log('[GmailWorker] Already running');
      return;
    }
    this.isRunning = true;
    console.log('[GmailWorker] Started');
  }

  stop() {
    this.isRunning = false;
    console.log('[GmailWorker] Stopped');
  }

  getStatus() {
    return { isRunning: this.isRunning };
  }
}

const gmailWorker = new GmailWorker();

module.exports = { gmailWorker, GmailWorker, getAuthUrl, exchangeCode, SCOPES };
