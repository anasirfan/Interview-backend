const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { google } = require('googleapis');
const { get, query, run } = require('../database/db');
const { generateUUID } = require('../utils/uuid');
const { aiProcessor } = require('./ai.processor');
const {
  normalizePosition,
  analyzePositionSignals,
  detectHardwareRole,
  detectPositionFromCV
} = require('../utils/position-normalizer');

class GmailRateLimitError extends Error {
  constructor(message, retryAt = null) {
    super(message);
    this.name = 'GmailRateLimitError';
    this.retryAt = retryAt;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeBase64Url(input) {
  return Buffer.from(String(input || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function parseFromHeader(from) {
  const raw = String(from || '').trim();
  const emailMatch = raw.match(/<([^>]+)>/);
  const email = emailMatch ? emailMatch[1].trim() : raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const name = raw.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || email.split('@')[0] || 'Unknown';
  return { name, email };
}

function buildOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google/callback'
  );
}

function getAuthUrl() {
  const oauth2Client = buildOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/calendar'
    ]
  });
}

async function exchangeCode(code) {
  const oauth2Client = buildOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

class GmailWorker {
  constructor() {
    this.isRunning = false;
    this.nextAllowedAt = 0;
    this.lastRequestAt = 0;
    this.queue = Promise.resolve();
    this.settings = {
      requestIntervalMs: 1250,
      sendIntervalMs: 1500,
      fetchBatchSize: 10,
      replyBatchSize: 10
    };
  }

  parseRetryAt(error) {
    const message = String(error?.message || '');
    const match = message.match(/Retry after ([0-9T:.\-Z]+)/i);
    if (match) {
      const value = Date.parse(match[1]);
      if (!Number.isNaN(value)) {
        return value;
      }
    }
    return null;
  }

  async waitForTurn(intervalMs = this.settings.requestIntervalMs) {
    const now = Date.now();
    const waitUntil = Math.max(this.nextAllowedAt, this.lastRequestAt + intervalMs);
    if (waitUntil > now) {
      await sleep(waitUntil - now);
    }
  }

  async enqueueRequest(_label, fn, intervalMs = this.settings.requestIntervalMs) {
    const runner = async () => {
      await this.waitForTurn(intervalMs);
      try {
        const result = await fn();
        this.lastRequestAt = Date.now();
        return result;
      } catch (error) {
        const retryAt = this.parseRetryAt(error);
        if (error?.code === 429 || error?.status === 429 || retryAt) {
          this.nextAllowedAt = retryAt || Date.now() + 60000;
          throw new GmailRateLimitError(
            `User-rate limit exceeded. Retry after ${new Date(this.nextAllowedAt).toISOString()}`,
            this.nextAllowedAt
          );
        }
        throw error;
      }
    };

    this.queue = this.queue.then(runner, runner);
    return this.queue;
  }

  async getAuthenticatedGmail() {
    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );

    if (!admin || !admin.google_token || !admin.google_refresh) {
      return null;
    }

    const oauth2Client = buildOAuthClient();
    oauth2Client.setCredentials({
      access_token: admin.google_token,
      refresh_token: admin.google_refresh
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    return { gmail, admin, oauth2Client };
  }

  extractBodyText(fullMsg) {
    const payload = fullMsg?.data?.payload || {};

    if (payload.body?.data) {
      return decodeBase64Url(payload.body.data).toString('utf-8');
    }

    const stack = [...(payload.parts || [])];
    while (stack.length > 0) {
      const part = stack.shift();
      if (part?.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data).toString('utf-8');
      }
      if (Array.isArray(part?.parts)) {
        stack.push(...part.parts);
      }
    }

    return '';
  }

  async extractTextFromBuffer(buffer, filename) {
    const lower = String(filename || '').toLowerCase();

    try {
      if (lower.endsWith('.pdf')) {
        const parsed = await pdfParse(buffer);
        return parsed?.text || '';
      }

      if (lower.endsWith('.docx')) {
        try {
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ buffer });
          return result?.value || '';
        } catch (_error) {
          return '';
        }
      }

      return buffer.toString('utf-8');
    } catch (_error) {
      return '';
    }
  }

  async extractCvAttachment(gmail, msgId, part) {
    const attachmentId = part?.body?.attachmentId;
    const safeName = `${Date.now()}-${String(part.filename || 'cv').replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
    const filePath = path.join(process.cwd(), 'uploads', `cv-${safeName}`);
    let cvText = '';

    try {
      const attachmentRes = await this.enqueueRequest(
        `get attachment ${msgId}`,
        () => gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: msgId,
          id: attachmentId
        })
      );

      const buffer = decodeBase64Url(attachmentRes?.data?.data || '');
      fs.mkdirSync(path.join(process.cwd(), 'uploads'), { recursive: true });
      fs.writeFileSync(filePath, buffer);
      cvText = await this.extractTextFromBuffer(buffer, part.filename);
      return { cvFilename: path.basename(filePath), cvText };
    } catch (_error) {
      return { cvFilename: path.basename(filePath), cvText: '' };
    }
  }

  classifyCandidatePosition(subject, bodyText, cvText = '') {
    const combinedText = `${subject}\n${bodyText}\n${cvText}`.trim();
    const normalized = normalizePosition(combinedText);
    if (normalized) {
      return normalized;
    }

    const signals = analyzePositionSignals(combinedText);
    const hardwareRole = detectHardwareRole(signals);

    if (combinedText.match(/\b(devops|dev\s*ops|infrastructure|deployment|ci\s*cd|docker|kubernetes)\b/i)) {
      return 'DevOps Engineer';
    }

    if (hardwareRole.role && hardwareRole.score > 0 && hardwareRole.score >= signals.ai) {
      return hardwareRole.role;
    }

    if (signals.aiStrong > 0 || (signals.aiWeak > 0 && hardwareRole.score === 0)) {
      return 'AI Engineer';
    }

    return detectPositionFromCV(combinedText);
  }

  async fetchNewEmails() {
    const auth = await this.getAuthenticatedGmail();
    if (!auth) return [];

    const { gmail } = auth;
    const processed = [];

    try {
      const listRes = await this.enqueueRequest(
        'list unread attachment emails',
        () => gmail.users.messages.list({
          userId: 'me',
          q: 'is:unread has:attachment',
          maxResults: this.settings.fetchBatchSize
        })
      );

      const messages = listRes?.data?.messages || [];

      for (const msg of messages) {
        if (!msg.id) continue;

        const existingThread = await get('SELECT id FROM candidates WHERE gmail_thread_id = ?', [msg.id]);
        if (existingThread) continue;

        try {
          const fullMsg = await this.enqueueRequest(
            `get message ${msg.id}`,
            () => gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
          );

          const headers = fullMsg.data.payload?.headers || [];
          const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
          const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
          const { name, email } = parseFromHeader(from);
          const parts = fullMsg.data.payload?.parts || [];

          let cvFilename = null;
          let cvText = '';
          const attachmentParts = parts.filter(part =>
            part.filename &&
            part.body?.attachmentId &&
            (part.mimeType?.includes('pdf') || part.mimeType?.includes('word') || part.mimeType?.includes('document') || part.filename.match(/\.(pdf|doc|docx)$/i))
          );

          for (const part of attachmentParts.slice(0, 1)) {
            const extracted = await this.extractCvAttachment(gmail, msg.id, part);
            cvFilename = extracted.cvFilename;
            cvText = extracted.cvText;
          }

          const bodyText = this.extractBodyText(fullMsg).slice(0, 4000);
          let candidateName = name;
          let candidateEmail = email;
          let candidatePhone = '';

          if (cvText && cvText.length > 50) {
            const contactInfo = await aiProcessor.extractContactInfo(cvText);
            if (contactInfo?.name) candidateName = contactInfo.name;
            if (contactInfo?.email) candidateEmail = contactInfo.email;
            if (contactInfo?.phone) candidatePhone = contactInfo.phone;
          }

          const inferredPosition = this.classifyCandidatePosition(subject, bodyText, cvText);
          const normalizedPosition =
            normalizePosition(inferredPosition) ||
            normalizePosition(`${subject}\n${bodyText}\n${cvText}`) ||
            detectPositionFromCV(`${subject}\n${bodyText}\n${cvText}`) ||
            'Full Stack Developer';

          const hasAssessment = /assessment|test|assignment/i.test(subject);
          const status = hasAssessment ? 'ASSESSMENT' : 'INBOX';
          const existingCandidate = await get('SELECT * FROM candidates WHERE email = ?', [candidateEmail]);

          if (existingCandidate) {
            await run(
              `UPDATE candidates
               SET gmail_thread_id = ?,
                   status = ?,
                   round_stage = ?,
                   cv_path = COALESCE(cv_path, ?),
                   position = COALESCE(position, ?),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [msg.id, status, status, cvFilename, normalizedPosition, existingCandidate.id]
            );
          } else {
            await run(
              `INSERT INTO candidates (
                 id, name, email, phone, position, status, round_stage, cv_path,
                 gmail_thread_id, assessment_given, remarks
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                generateUUID(),
                candidateName || 'Unknown Candidate',
                candidateEmail || `${generateUUID()}@unknown.local`,
                candidatePhone || null,
                normalizedPosition || 'Full Stack Developer',
                status,
                status,
                cvFilename,
                msg.id,
                hasAssessment ? 1 : 0,
                bodyText.slice(0, 500) || null
              ]
            );
          }

          await this.enqueueRequest(
            `mark message ${msg.id} read`,
            () => gmail.users.messages.modify({
              userId: 'me',
              id: msg.id,
              requestBody: { removeLabelIds: ['UNREAD'] }
            })
          );

          processed.push(msg.id);
        } catch (error) {
          if (error instanceof GmailRateLimitError) {
            break;
          }
          console.error(`[GmailWorker] Error processing message ${msg.id}:`, error.message);
        }
      }
    } catch (error) {
      if (!(error instanceof GmailRateLimitError)) {
        throw error;
      }
    }

    return processed;
  }

  async markAllPreviousEmailsAsRead() {
    const auth = await this.getAuthenticatedGmail();
    if (!auth) {
      return { updated: 0 };
    }

    const { gmail } = auth;
    const listRes = await this.enqueueRequest(
      'list unread emails',
      () => gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 100
      })
    );

    const messages = listRes?.data?.messages || [];
    for (const msg of messages) {
      await this.enqueueRequest(
        `mark old message ${msg.id} read`,
        () => gmail.users.messages.modify({
          userId: 'me',
          id: msg.id,
          requestBody: { removeLabelIds: ['UNREAD'] }
        })
      );
    }

    return { updated: messages.length };
  }

  async sendReply(candidateEmail, subject, body) {
    const auth = await this.getAuthenticatedGmail();
    if (!auth) throw new Error('No OAuth tokens');

    const { gmail } = auth;
    const raw = Buffer.from(
      `To: ${candidateEmail}\r\n` +
      `Subject: ${subject}\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
      body
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await this.enqueueRequest(
      `send email to ${candidateEmail}`,
      () => gmail.users.messages.send({ userId: 'me', requestBody: { raw } }),
      this.settings.sendIntervalMs
    );
  }

  async checkAssessmentReplies() {
    const candidates = await query(
      `SELECT id, email
       FROM candidates
       WHERE assessment_given = 1
         AND email IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT ?`,
      [this.settings.replyBatchSize]
    );

    return { checked: candidates.length };
  }

  start() {
    this.isRunning = true;
  }

  stop() {
    this.isRunning = false;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      nextAllowedAt: this.nextAllowedAt || null,
      lastRequestAt: this.lastRequestAt || null,
      requestIntervalMs: this.settings.requestIntervalMs,
      fetchBatchSize: this.settings.fetchBatchSize,
      replyBatchSize: this.settings.replyBatchSize
    };
  }
}

const gmailWorker = new GmailWorker();

module.exports = {
  gmailWorker,
  GmailWorker,
  GmailRateLimitError,
  getAuthUrl,
  exchangeCode,
  parseFromHeader
};
