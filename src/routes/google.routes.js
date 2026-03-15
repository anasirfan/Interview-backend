const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getAuthUrl, exchangeCode, gmailWorker } = require('../workers/gmail.worker');
const { google } = require('googleapis');
const { get, run, query } = require('../database/db');
const activityLogService = require('../services/activityLog.service');
const candidateService = require('../services/candidate.service');

const router = Router();

router.get('/auth-url', authenticate, (_req, res) => {
  try {
    const url = getAuthUrl();
    sendSuccess(res, 'OAuth URL generated', { url });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) {
      res.redirect('https://ims-frontend-smoky-chi.vercel.app/dashboard?google=error');
      return;
    }

    const tokens = await exchangeCode(code);

    const admin = await get(
      "SELECT * FROM admins WHERE role IN ('SUPER_ADMIN', 'HR_ADMIN') ORDER BY created_at ASC LIMIT 1"
    );

    if (admin) {
      await run(
        'UPDATE admins SET google_token = ?, google_refresh = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [tokens.access_token || null, tokens.refresh_token || null, admin.id]
      );
      console.log(`[Google OAuth] Tokens saved for ${admin.email}`);
    }

    gmailWorker.start();

    res.redirect('https://ims-frontend-smoky-chi.vercel.app/dashboard?google=success');
  } catch (error) {
    console.error('[Google OAuth] Error:', error.message);
    res.redirect('https://ims-frontend-smoky-chi.vercel.app/dashboard?google=error');
  }
});

router.post('/revoke', authenticate, async (_req, res) => {
  try {
    await run('UPDATE admins SET google_token = NULL, google_refresh = NULL WHERE google_token IS NOT NULL');
    sendSuccess(res, 'Google tokens cleared. Please re-authorize with Connect Google OAuth.');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/fetch-emails', authenticate, async (_req, res) => {
  try {
    const processed = await gmailWorker.fetchNewEmails();
    const recent = await query(`
      SELECT id, name, email, status, round_stage, cv_path, position, created_at 
      FROM candidates 
      WHERE datetime(updated_at) >= datetime('now', '-5 minutes')
      ORDER BY updated_at DESC
    `);
    sendSuccess(res, `Fetched ${processed?.length || 0} new emails`, { 
      count: processed?.length || 0, 
      candidates: recent 
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/mark-all-read', authenticate, async (_req, res) => {
  try {
    const result = await gmailWorker.markAllPreviousEmailsAsRead();
    sendSuccess(res, 'Marked previous emails as read', result);
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/categorize/:id', authenticate, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      sendError(res, 'category required (CV, ASSESSMENT, REPLY)', 400);
      return;
    }
    
    const candidate = await candidateService.findById(req.params.id);
    if (!candidate) {
      sendError(res, 'Candidate not found', 404);
      return;
    }

    const statusMap = { CV: 'INBOX', ASSESSMENT: 'ASSESSMENT', REPLY: 'ASSESSMENT' };
    const updated = await candidateService.update(req.params.id, {
      status: statusMap[category] || candidate.status,
      round_stage: statusMap[category] || candidate.round_stage,
      assessment_given: category === 'ASSESSMENT' || category === 'REPLY' ? 1 : 0,
    });

    await activityLogService.create({
      action: 'CATEGORIZE',
      entity: 'Candidate',
      entityId: candidate.id,
      details: `Categorized as ${category}`,
      adminId: req.user.id,
      candidateId: candidate.id,
    });

    sendSuccess(res, `Categorized as ${category}`, updated);
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/send-reply', authenticate, async (req, res) => {
  try {
    const { candidateId, candidateEmail, subject, body } = req.body;
    if (!candidateEmail || !body) {
      sendError(res, 'candidateEmail and body required', 400);
      return;
    }
    
    await gmailWorker.sendReply(candidateEmail, subject || 'Re: Interview', body);

    if (candidateId) {
      const candidate = await candidateService.findById(candidateId);
      if (candidate) {
        const existingConvo = candidate.remarks ? candidate.remarks + '\n' : '';
        const timestamp = new Date().toISOString();
        const newMsg = `[SENT ${timestamp}] ${body.slice(0, 300)}`;
        await candidateService.update(candidateId, {
          remarks: (existingConvo + newMsg).slice(-5000)
        });

        await activityLogService.create({
          action: 'EMAIL_SENT',
          entity: 'Candidate',
          entityId: candidateId,
          details: `Sent email: ${subject}`,
          adminId: req.user.id,
          candidateId: candidateId,
        });
      }
    }

    sendSuccess(res, 'Email sent successfully');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.get('/conversation/:id', authenticate, async (req, res) => {
  try {
    const candidate = await candidateService.findById(req.params.id);
    if (!candidate) {
      sendError(res, 'Candidate not found', 404);
      return;
    }

    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );

    const messages = [];

    if (admin?.google_token && admin?.google_refresh && candidate.gmail_thread_id) {
      try {
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
        
        const searchRes = await gmail.users.messages.list({
          userId: 'me',
          q: `from:${candidate.email} OR to:${candidate.email}`,
          maxResults: 20,
        });

        const gmailMessages = searchRes.data.messages || [];

        for (const msg of gmailMessages) {
          const fullMsg = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });

          const headers = fullMsg.data.payload?.headers || [];
          const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
          const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
          const date = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';

          let bodyText = '';
          const parts = fullMsg.data.payload?.parts || [];
          const textPart = parts.find(p => p.mimeType === 'text/plain');
          if (textPart?.body?.data) {
            const decoded = Buffer.from(
              textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'),
              'base64'
            );
            bodyText = decoded.toString('utf-8').slice(0, 1000);
          }

          messages.push({
            id: msg.id,
            from,
            subject,
            date,
            snippet: fullMsg.data.snippet || '',
            body: bodyText,
          });
        }
      } catch (gmailErr) {
        console.error('[Google] Gmail conversation fetch error:', gmailErr.message);
      }
    }

    sendSuccess(res, 'Conversation retrieved', { messages });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/schedule', authenticate, async (req, res) => {
  try {
    let { candidateId, summary, description, startTime, endTime, attendees } = req.body;
    
    if (!candidateId || !summary || !startTime) {
      sendError(res, 'candidateId, summary, and startTime required', 400);
      return;
    }

    // Default to 30 minutes duration if endTime not provided
    if (!endTime) {
      const start = new Date(startTime);
      const end = new Date(start.getTime() + 30 * 60 * 1000); // Add 30 minutes
      endTime = end.toISOString();
    }

    const candidate = await candidateService.findById(candidateId);
    if (!candidate) {
      sendError(res, 'Candidate not found', 404);
      return;
    }

    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );

    if (!admin?.google_token || !admin?.google_refresh) {
      sendError(res, 'Google Calendar not connected', 400);
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

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event = {
      summary,
      description: description || `Interview with ${candidate.name} for ${candidate.position}`,
      start: { dateTime: startTime, timeZone: 'UTC' },
      end: { dateTime: endTime, timeZone: 'UTC' },
      attendees: attendees || [{ email: candidate.email }],
      conferenceData: {
        createRequest: {
          requestId: `meet-${candidateId}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    const calendarEvent = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
    });

    const meetLink = calendarEvent.data.hangoutLink || calendarEvent.data.conferenceData?.entryPoints?.[0]?.uri || '';

    await candidateService.update(candidateId, {
      interview_date: startTime,
      calendar_event_id: calendarEvent.data.id,
      meet_link: meetLink,
      status: 'SCHEDULED',
      round_stage: 'SCHEDULED',
      interviewer_id: req.user.id,
    });

    await activityLogService.create({
      action: 'INTERVIEW_SCHEDULED',
      entity: 'Candidate',
      entityId: candidateId,
      details: `Scheduled interview for ${startTime}`,
      adminId: req.user.id,
      candidateId: candidateId,
    });

    sendSuccess(res, 'Interview scheduled', {
      eventId: calendarEvent.data.id,
      meetLink,
      htmlLink: calendarEvent.data.htmlLink,
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.get('/calendar/events', authenticate, async (_req, res) => {
  try {
    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );

    if (!admin?.google_token || !admin?.google_refresh) {
      sendError(res, 'Google Calendar not connected', 400);
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

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    });

    sendSuccess(res, 'Calendar events retrieved', events.data.items || []);
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.get('/drive/recordings', authenticate, async (_req, res) => {
  try {
    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );

    if (!admin?.google_token || !admin?.google_refresh) {
      sendError(res, 'Google Drive not connected', 400);
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

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.files.list({
      q: "mimeType='video/mp4' and name contains 'GMT'",
      fields: 'files(id, name, webViewLink, createdTime, size)',
      orderBy: 'createdTime desc',
      pageSize: 50,
    });

    sendSuccess(res, 'Drive recordings retrieved', response.data.files || []);
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/drive/match-recording', authenticate, async (req, res) => {
  try {
    const { candidateId, recordingLink } = req.body;
    
    if (!candidateId || !recordingLink) {
      sendError(res, 'candidateId and recordingLink required', 400);
      return;
    }

    const candidate = await candidateService.findById(candidateId);
    if (!candidate) {
      sendError(res, 'Candidate not found', 404);
      return;
    }

    await candidateService.update(candidateId, {
      meeting_recording: recordingLink,
      google_drive_link: recordingLink,
    });

    await activityLogService.create({
      action: 'RECORDING_LINKED',
      entity: 'Candidate',
      entityId: candidateId,
      details: `Linked recording: ${recordingLink}`,
      adminId: req.user.id,
      candidateId: candidateId,
    });

    sendSuccess(res, 'Recording linked to candidate');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.get('/list-amish-cvs', authenticate, async (_req, res) => {
  try {
    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );
    
    if (!admin?.google_token || !admin?.google_refresh) {
      sendError(res, 'Google OAuth not connected', 400);
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

    const searches = [
      'from:amish.hassan@es.uol.edu.pk subject:"Internship Candidates Recommendation"',
      'from:amish.hassan has:attachment after:2026/02/02',
    ];

    const allMsgIds = new Set();
    for (const q of searches) {
      try {
        const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 10 });
        for (const m of (res.data.messages || [])) {
          if (m.id) allMsgIds.add(m.id);
        }
      } catch {}
    }

    const cvList = [];

    for (const msgId of Array.from(allMsgIds)) {
      const full = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' });
      const headers = full.data.payload?.headers || [];
      const subject = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '';
      const from = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';
      const date = headers.find((h) => h.name?.toLowerCase() === 'date')?.value || '';

      function getAllParts(payload) {
        const parts = [];
        if (payload.parts) {
          for (const p of payload.parts) {
            parts.push(p);
            if (p.parts) parts.push(...getAllParts(p));
          }
        }
        return parts;
      }

      const allParts = getAllParts(full.data.payload || {});

      for (const part of allParts) {
        if (part.filename && part.body?.attachmentId && part.filename.match(/\.(pdf|doc|docx)$/i)) {
          cvList.push({
            messageId: msgId,
            attachmentId: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size || 0,
            emailSubject: subject,
            emailFrom: from,
            emailDate: date,
          });
        }
      }
    }

    sendSuccess(res, `Found ${cvList.length} CV attachments`, { cvs: cvList });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/process-selected-cvs', authenticate, async (req, res) => {
  try {
    const { selectedCvs } = req.body;
    if (!selectedCvs || !Array.isArray(selectedCvs)) {
      sendError(res, 'selectedCvs array required', 400);
      return;
    }

    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );
    
    if (!admin?.google_token || !admin?.google_refresh) {
      sendError(res, 'Google OAuth not connected', 400);
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
    const fs = require('fs');
    const path = require('path');
    const { aiProcessor } = require('../workers/ai.processor');
    const { generateUUID } = require('../utils/uuid');

    const created = [];
    const log = [];

    for (const cv of selectedCvs) {
      try {
        const { messageId, attachmentId, filename } = cv;

        const attachRes = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId,
          id: attachmentId,
        });

        if (!attachRes.data.data) {
          log.push(`SKIP: ${filename} - no data`);
          continue;
        }

        const buffer = Buffer.from(
          attachRes.data.data.replace(/-/g, '+').replace(/_/g, '/'),
          'base64'
        );
        const safeName = `cv-${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const uploadPath = path.join(process.cwd(), 'uploads', safeName);
        fs.writeFileSync(uploadPath, buffer);

        const nameFromFile = filename
          .replace(/\.(pdf|doc|docx)$/i, '')
          .replace(/[_-]/g, ' ')
          .replace(/cv|resume|CV|Resume/gi, '')
          .trim();
        const candidateName = nameFromFile.length > 2 ? nameFromFile : 'Unknown Candidate';

        const candidateId = generateUUID();
        await run(`
          INSERT INTO candidates (
            id, name, email, position, status, round_stage, cv_path, gmail_thread_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          candidateId,
          candidateName,
          `${candidateName.toLowerCase().replace(/\s+/g, '.')}@pending.com`,
          'Internship Candidate',
          'INBOX',
          'INBOX',
          safeName,
          messageId,
        ]);

        try {
          const analysis = await aiProcessor.analyzeCandidate(candidateName, 'Internship Candidate');
          if (analysis.highlights) {
            await run(`
              UPDATE candidates 
              SET key_highlights = ?, updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?
            `, [JSON.stringify(analysis.highlights), candidateId]);
          }
        } catch {}

        created.push({ id: candidateId, name: candidateName, cvPath: safeName });
        log.push(`CREATED: ${candidateName} [${safeName}]`);
      } catch (e) {
        log.push(`ERROR: ${cv.filename} - ${e.message}`);
      }
    }

    sendSuccess(res, `Created ${created.length} candidates`, { created, log });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.get('/list-sent-assessments', authenticate, async (_req, res) => {
  try {
    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );
    
    if (!admin?.google_token || !admin?.google_refresh) {
      sendError(res, 'Google OAuth not connected', 400);
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

    const sentSearch = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:sent (assessment OR task OR assignment) after:2026/02/02',
      maxResults: 50,
    });

    const assessments = [];

    for (const msg of (sentSearch.data.messages || [])) {
      if (!msg.id) continue;
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['To', 'Subject', 'Date'],
        });
        const headers = full.data.payload?.headers || [];
        const to = headers.find((h) => h.name === 'To')?.value || '';
        const subject = headers.find((h) => h.name === 'Subject')?.value || '';
        const date = headers.find((h) => h.name === 'Date')?.value || '';

        assessments.push({
          messageId: msg.id,
          to,
          subject,
          date,
        });
      } catch {}
    }

    sendSuccess(res, `Found ${assessments.length} sent assessment emails`, { assessments });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/match-assessment', authenticate, async (req, res) => {
  try {
    const { candidateId, assessmentEmail, messageId } = req.body;
    if (!candidateId || !assessmentEmail) {
      sendError(res, 'candidateId and assessmentEmail required', 400);
      return;
    }

    // Extract clean email address from format like "Name <email@domain.com>"
    let cleanEmail = assessmentEmail;
    const emailMatch = assessmentEmail.match(/<([^>]+)>/);
    if (emailMatch) {
      cleanEmail = emailMatch[1];
    }

    let assessmentLink = null;

    // If messageId provided, fetch the email and extract assessment link
    if (messageId) {
      try {
        const admin = await get(
          'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
        );
        
        if (admin?.google_token && admin?.google_refresh) {
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

          const message = await gmail.users.messages.get({
            userId: 'me',
            id: messageId,
            format: 'full',
          });

          // Extract body
          let body = '';
          if (message.data.payload?.parts) {
            const textPart = message.data.payload.parts.find(p => p.mimeType === 'text/plain' || p.mimeType === 'text/html');
            if (textPart?.body?.data) {
              body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
            }
          } else if (message.data.payload?.body?.data) {
            body = Buffer.from(message.data.payload.body.data, 'base64').toString('utf-8');
          }

          // Extract assessment link from body
          const linkMatch = body.match(/assessment[\/\?]([a-f0-9]{32})/i) || 
                           body.match(/link[=\/]([a-f0-9]{32})/i) ||
                           body.match(/([a-f0-9]{32})/);
          if (linkMatch) {
            assessmentLink = linkMatch[1];
          }
        }
      } catch (err) {
        console.error('Failed to extract assessment link:', err);
      }
    }

    // Get current candidate to check status
    const candidate = await candidateService.findById(candidateId);
    const statusPriority = ['INBOX', 'ASSESSMENT', 'SCHEDULED', 'INTERVIEW', 'SHORTLISTED', 'HIRED'];
    const currentPriority = statusPriority.indexOf(candidate?.status || 'INBOX');
    const assessmentPriority = statusPriority.indexOf('ASSESSMENT');

    // Only update status if current status is lower priority than ASSESSMENT
    const updateData = {
      email: cleanEmail,
      assessment_given: 1,
      assessment_link: assessmentLink,
    };

    if (currentPriority < assessmentPriority) {
      updateData.status = 'ASSESSMENT';
      updateData.round_stage = 'ASSESSMENT';
    }

    await candidateService.update(candidateId, updateData);

    await activityLogService.create({
      action: 'ASSESSMENT_MATCHED',
      entity: 'Candidate',
      entityId: candidateId,
      details: `Assessment email matched: ${cleanEmail}${assessmentLink ? ` (Link: ${assessmentLink})` : ''}`,
      adminId: req.user.id,
      candidateId,
    });

    sendSuccess(res, 'Assessment matched to candidate');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.get('/list-sent-scheduling', authenticate, async (_req, res) => {
  try {
    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );
    
    if (!admin?.google_token || !admin?.google_refresh) {
      sendError(res, 'Google OAuth not connected', 400);
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

    const schedulingSearch = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:sent subject:"Interview Invitation" after:2026/02/17 before:2026/02/25',
      maxResults: 50,
    });

    const schedulingEmails = [];

    for (const msg of (schedulingSearch.data.messages || [])) {
      if (!msg.id) continue;
      try {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['To', 'Subject', 'Date'],
        });
        const headers = full.data.payload?.headers || [];
        const to = headers.find((h) => h.name === 'To')?.value || '';
        const subject = headers.find((h) => h.name === 'Subject')?.value || '';
        const date = headers.find((h) => h.name === 'Date')?.value || '';

        schedulingEmails.push({
          messageId: msg.id,
          to,
          subject,
          date,
        });
      } catch {}
    }

    sendSuccess(res, `Found ${schedulingEmails.length} scheduling emails`, { schedulingEmails });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/match-scheduling', authenticate, async (req, res) => {
  try {
    const { candidateId, schedulingDate } = req.body;
    if (!candidateId || !schedulingDate) {
      sendError(res, 'candidateId and schedulingDate required', 400);
      return;
    }

    // Get current candidate to check status
    const candidate = await candidateService.findById(candidateId);
    const statusPriority = ['INBOX', 'ASSESSMENT', 'SCHEDULED', 'INTERVIEW', 'SHORTLISTED', 'HIRED'];
    const currentPriority = statusPriority.indexOf(candidate?.status || 'INBOX');
    const scheduledPriority = statusPriority.indexOf('SCHEDULED');

    // Only update status if current status is lower priority than SCHEDULED
    const updateData = {
      interview_date: schedulingDate,
    };

    if (currentPriority < scheduledPriority) {
      updateData.status = 'SCHEDULED';
      updateData.round_stage = 'SCHEDULED';
    }

    await candidateService.update(candidateId, updateData);

    await activityLogService.create({
      action: 'SCHEDULING_MATCHED',
      entity: 'Candidate',
      entityId: candidateId,
      details: `Scheduling matched for ${schedulingDate}`,
      adminId: req.user.id,
      candidateId,
    });

    sendSuccess(res, 'Scheduling matched to candidate');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.get('/list-drive-recordings-notes', authenticate, async (_req, res) => {
  try {
    const admin = await get(
      'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
    );
    
    if (!admin?.google_token || !admin?.google_refresh) {
      sendError(res, 'Google OAuth not connected', 400);
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
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const folderSearch = await drive.files.list({
      q: "name='Meet Recordings' and mimeType='application/vnd.google-apps.folder'",
      fields: 'files(id, name)',
    });

    const folder = folderSearch.data.files?.[0];
    if (!folder?.id) {
      sendError(res, 'Meet Recordings folder not found', 404);
      return;
    }

    const filesSearch = await drive.files.list({
      q: `'${folder.id}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, webViewLink, createdTime, size)',
      orderBy: 'createdTime desc',
    });

    const recordings = [];
    const notes = [];

    for (const file of (filesSearch.data.files || [])) {
      const item = {
        fileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        link: file.webViewLink,
        createdTime: file.createdTime,
        size: file.size,
      };

      if (file.mimeType?.includes('video') || file.name?.match(/\.(mp4|webm|mkv)$/i)) {
        recordings.push(item);
      } else if (file.mimeType?.includes('document') || file.name?.match(/\.(doc|docx|txt|pdf)$/i)) {
        notes.push(item);
      }
    }

    sendSuccess(res, `Found ${recordings.length} recordings and ${notes.length} notes`, {
      recordings,
      notes,
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

router.post('/match-recording-notes', authenticate, async (req, res) => {
  try {
    const { candidateId, recordingLink, notesLink } = req.body;
    if (!candidateId) {
      sendError(res, 'candidateId required', 400);
      return;
    }

    // Get current candidate to check status
    const candidate = await candidateService.findById(candidateId);
    const statusPriority = ['INBOX', 'ASSESSMENT', 'SCHEDULED', 'INTERVIEW', 'SHORTLISTED', 'HIRED'];
    const currentPriority = statusPriority.indexOf(candidate?.status || 'INBOX');
    const interviewPriority = statusPriority.indexOf('INTERVIEW');

    const updateData = {};

    // Only update status if current status is lower priority than INTERVIEW
    if (currentPriority < interviewPriority) {
      updateData.status = 'INTERVIEW';
      updateData.round_stage = 'INTERVIEW';
    }

    if (recordingLink) {
      updateData.google_drive_link = recordingLink;
      updateData.meeting_recording = recordingLink;
    }

    if (notesLink) {
      updateData.meeting_notes = notesLink;
    }

    await candidateService.update(candidateId, updateData);

    await activityLogService.create({
      action: 'RECORDING_NOTES_MATCHED',
      entity: 'Candidate',
      entityId: candidateId,
      details: `Recording and notes matched`,
      adminId: req.user.id,
      candidateId,
    });

    sendSuccess(res, 'Recording and notes matched to candidate');
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Create Google Meet link and add to calendar
router.post('/create-meet', authenticate, async (req, res) => {
  try {
    const { candidateId, candidateName, position, dateTime, duration, round, interviewer } = req.body;
    const logger = require('../services/logger.service');
    
    // Get admin's Google OAuth tokens
    const admins = await query('SELECT * FROM admins WHERE google_token IS NOT NULL LIMIT 1');
    if (!admins || admins.length === 0) {
      return sendError(res, 'No Google authentication found. Please authenticate with Google first.', 401);
    }
    
    const admin = admins[0];
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    oauth2Client.setCredentials({
      access_token: admin.google_token,
      refresh_token: admin.google_refresh,
    });
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Get candidate email
    const candidates = await query('SELECT email FROM candidates WHERE id = ?', [candidateId]);
    const candidateEmail = candidates[0]?.email;
    
    // Create calendar event with Google Meet
    const startDateTime = new Date(dateTime);
    // duration is in minutes, convert to milliseconds
    const durationInMinutes = duration || 30; // Default to 30 mins
    const endDateTime = new Date(startDateTime.getTime() + durationInMinutes * 60000);
    
    // Build attendees list: candidate + interviewer
    const attendees = [];
    if (candidateEmail) {
      attendees.push({ email: candidateEmail });
    }
    if (interviewer) {
      attendees.push({ email: interviewer });
    }
    
    const event = {
      summary: `${round} - ${candidateName}`,
      description: `Interview for ${position} position at LIMI AI\nInterviewer: ${interviewer || 'TBD'}`,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'UTC',
      },
      attendees: attendees,
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };
    
    const calendarEvent = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
    });
    
    const meetLink = calendarEvent.data.hangoutLink;
    
    if (!meetLink) {
      return sendError(res, 'Failed to generate Google Meet link. Ensure you have a Google Workspace account.', 500);
    }
    
    // Update candidate with meet link, calendar event ID, and interviewer
    await run(
      'UPDATE candidates SET meet_link = ?, calendar_event_id = ?, interview_date = ?, interviewer = ? WHERE id = ?',
      [meetLink, calendarEvent.data.id, dateTime, interviewer, candidateId]
    );
    
    logger.success('MEETING', `Google Meet created for ${candidateName}`, {
      candidateId,
      meetLink,
      eventId: calendarEvent.data.id,
      dateTime
    });
    
    sendSuccess(res, 'Google Meet link created and added to calendar', {
      meetLink,
      eventId: calendarEvent.data.id,
      eventLink: calendarEvent.data.htmlLink
    });
  } catch (error) {
    const logger = require('../services/logger.service');
    logger.error('MEETING', 'Failed to create Google Meet', { error: error.message });
    sendError(res, error.message || 'Failed to create Meet link', 500);
  }
});

router.post('/mark-rejected', authenticate, async (req, res) => {
  try {
    const result = await run(`
      UPDATE candidates 
      SET status = 'REJECTED', 
          round_stage = 'REJECTED',
          updated_at = CURRENT_TIMESTAMP
      WHERE assessment_given = 1 
        AND round_stage = 'ASSESSMENT' 
        AND is_archived = 0
        AND assessment_link IS NULL
    `);

    sendSuccess(res, `Marked candidates as rejected`, { changes: result.changes });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

module.exports = router;
