const candidateService = require('../services/candidate.service');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const logger = require('../services/logger.service');
const emailService = require('../services/email.service');
const fs = require('fs');
const path = require('path');

async function createCandidate(req, res) {
  try {
    const data = { ...req.body };
    
    if (req.file) {
      data.cvPath = req.file.filename;
    }

    const candidate = await candidateService.create(data);
    sendSuccess(res, 'Candidate created successfully', candidate, 201);
  } catch (error) {
    sendError(res, error.message || 'Failed to create candidate', 500);
  }
}

async function bulkUploadCV(req, res) {
  try {
    if (!req.file) {
      return sendError(res, 'No CV file uploaded', 400);
    }

    const cvPath = req.file.filename;
    const fullPath = path.join(process.cwd(), 'uploads', cvPath);

    // Extract text from PDF
    const pdfParse = require('pdf-parse');
    const dataBuffer = fs.readFileSync(fullPath);
    const pdfData = await pdfParse(dataBuffer);
    const cvText = pdfData.text;

    if (!cvText || cvText.trim().length < 50) {
      return sendError(res, 'Could not extract text from PDF', 400);
    }

    // Use AI to extract candidate information
    const { aiProcessor } = require('../workers/ai.processor');
    
    // Extract contact info (name, email, phone)
    const contactInfo = await aiProcessor.extractContactInfo(cvText);
    
    if (!contactInfo || !contactInfo.name) {
      return sendError(res, 'Could not extract candidate information from CV', 400);
    }

    // Extract position from CV text (simple extraction)
    let position = 'Not Specified';
    const positionMatch = cvText.match(/(?:position|role|title|designation)[\s:]+([^\n]+)/i);
    if (positionMatch) {
      position = positionMatch[1].trim().slice(0, 100);
    } else {
      // Try to find common job titles
      const jobTitles = ['developer', 'engineer', 'designer', 'manager', 'analyst', 'consultant', 'specialist'];
      for (const title of jobTitles) {
        const regex = new RegExp(`(\\w+\\s+)?${title}`, 'i');
        const match = cvText.match(regex);
        if (match) {
          position = match[0].trim();
          break;
        }
      }
    }

    // Create candidate with extracted data
    const candidateData = {
      name: contactInfo.name || 'Unknown',
      email: contactInfo.email || null,
      phone: contactInfo.phone || null,
      position: position,
      status: 'INBOX',
      roundStage: 'INBOX',
      cvPath: cvPath
    };

    const candidate = await candidateService.create(candidateData);
    
    logger.success('BULK_UPLOAD', `Candidate created from CV: ${candidate.name}`, {
      candidateId: candidate.id,
      cvPath
    });

    sendSuccess(res, 'Candidate created from CV', candidate, 201);
  } catch (error) {
    logger.error('BULK_UPLOAD', 'Failed to process CV', { error: error.message });
    sendError(res, error.message || 'Failed to process CV', 500);
  }
}

async function getCandidates(req, res) {
  try {
    const { page = 1, limit = 50, status, position, search, isArchived } = req.query;
    
    const filters = {
      status,
      position,
      search,
      isArchived: isArchived === 'true' ? true : isArchived === 'false' ? false : undefined,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    };

    const candidates = await candidateService.findAll(filters);
    const total = await candidateService.count(filters);

    sendSuccess(res, 'Candidates retrieved', candidates, 200, {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve candidates', 500);
  }
}

async function getCandidateById(req, res) {
  try {
    const candidate = await candidateService.findById(req.params.id);
    
    if (!candidate) {
      return sendError(res, 'Candidate not found', 404);
    }

    sendSuccess(res, 'Candidate retrieved', candidate);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve candidate', 500);
  }
}

async function updateCandidate(req, res) {
  try {
    const data = { ...req.body };
    
    if (req.file) {
      data.cvPath = req.file.filename;
    }

    const candidate = await candidateService.update(req.params.id, data);
    
    if (!candidate) {
      return sendError(res, 'Candidate not found', 404);
    }

    sendSuccess(res, 'Candidate updated successfully', candidate);
  } catch (error) {
    sendError(res, error.message || 'Failed to update candidate', 500);
  }
}

async function updateCandidateStatus(req, res) {
  try {
    const { status, roundStage } = req.body;
    const candidate = await candidateService.update(req.params.id, { status, round_stage: roundStage });
    
    if (!candidate) {
      return sendError(res, 'Candidate not found', 404);
    }

    sendSuccess(res, 'Status updated', candidate);
  } catch (error) {
    sendError(res, error.message || 'Failed to update status', 500);
  }
}

async function shortlistCandidate(req, res) {
  try {
    const candidate = await candidateService.update(req.params.id, { status: 'SHORTLISTED', round_stage: 'SHORTLISTED' });
    
    if (!candidate) {
      return sendError(res, 'Candidate not found', 404);
    }

    sendSuccess(res, 'Candidate shortlisted', candidate);
  } catch (error) {
    sendError(res, error.message || 'Failed to shortlist candidate', 500);
  }
}

async function archiveCandidate(req, res) {
  try {
    const candidate = await candidateService.update(req.params.id, { is_archived: 1 });
    
    if (!candidate) {
      return sendError(res, 'Candidate not found', 404);
    }

    sendSuccess(res, 'Candidate archived', candidate);
  } catch (error) {
    sendError(res, error.message || 'Failed to archive candidate', 500);
  }
}

async function deleteCandidate(req, res) {
  try {
    await candidateService.delete(req.params.id);
    sendSuccess(res, 'Candidate deleted successfully');
  } catch (error) {
    sendError(res, error.message || 'Failed to delete candidate', 500);
  }
}

async function getMetrics(req, res) {
  try {
    const metrics = await candidateService.getMetrics();
    sendSuccess(res, 'Metrics retrieved', metrics);
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve metrics', 500);
  }
}

async function exportCsv(req, res) {
  try {
    const candidates = await candidateService.findAll({ isArchived: false });
    
    const csv = [
      'Name,Email,Phone,Position,Status,Round Stage,Interview Date,Rating,Created At',
      ...candidates.map(c => 
        `"${c.name}","${c.email}","${c.phone || ''}","${c.position}","${c.status}","${c.round_stage}","${c.interview_date || ''}","${c.rating || ''}","${c.created_at}"`
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=candidates.csv');
    res.send(csv);
  } catch (error) {
    sendError(res, error.message || 'Failed to export CSV', 500);
  }
}

async function generateAssessmentEmail(req, res) {
  try {
    const candidate = await candidateService.findById(req.params.id);
    
    if (!candidate) {
      return sendError(res, 'Candidate not found', 404);
    }

    const subject = `LIMI AI Assessment | ${candidate.name}`;
    const body = `Dear ${candidate.name},

Thank you for your interest in the ${candidate.position} position at LIMI AI.

We would like to invite you to complete a technical assessment as the next step in our hiring process. This assessment will help us evaluate your skills and determine if you're a good fit for the role.

Please find the assessment details below and submit your completed work within 48 hours.

Assessment Instructions:
- Review the attached assessment file carefully
- Complete all required tasks
- Submit your solution via the provided link
- Feel free to reach out if you have any questions

We look forward to reviewing your submission!

Best regards,
LIMI AI Recruitment Team`;

    sendSuccess(res, 'Assessment email generated', { subject, body });
  } catch (error) {
    sendError(res, error.message || 'Failed to generate email', 500);
  }
}

async function sendAssessmentEmail(req, res) {
  let candidate = null;
  try {
    const { subject, body } = req.body;
    candidate = await candidateService.findById(req.params.id);
    
    if (!candidate) {
      logger.error('ASSESSMENT', 'Candidate not found for assessment email', { candidateId: req.params.id });
      return sendError(res, 'Candidate not found', 404);
    }

    let assessmentPath = null;
    let assessmentFilename = null;
    if (req.file) {
      assessmentPath = req.file.path;
      assessmentFilename = req.file.originalname;
      logger.info('ASSESSMENT', 'File uploaded for assessment', {
        path: req.file.path,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    }

    // Actually send the email via Gmail API
    const emailResult = await emailService.sendAssessmentEmail({
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      subject,
      body,
      attachmentPath: assessmentPath,
      attachmentFilename: assessmentFilename
    });

    // Update candidate status only after email is sent successfully
    await candidateService.update(req.params.id, {
      assessment_given: 1,
      assessment_link: req.file?.filename || null,
      status: 'ASSESSMENT',
      round_stage: 'ASSESSMENT'
    });

    // Store sent message in database for conversation tracking
    const { v4: uuidv4 } = require('uuid');
    const { query } = require('../database/db');
    await query(`
      INSERT INTO messages (id, candidate_id, gmail_message_id, direction, subject, body, is_read, created_at)
      VALUES (?, ?, ?, 'SENT', ?, ?, 1, CURRENT_TIMESTAMP)
    `, [uuidv4(), candidate.id, emailResult.messageId, subject, body]);

    logger.success('ASSESSMENT', `Assessment email sent to ${candidate.name}`, {
      candidateId: candidate.id,
      email: candidate.email,
      subject,
      messageId: emailResult.messageId,
      hasAttachment: !!req.file
    });

    sendSuccess(res, 'Assessment email sent successfully', {
      messageId: emailResult.messageId,
      threadId: emailResult.threadId
    });
  } catch (error) {
    logger.emailFailed(candidate?.email || 'unknown', req.body.subject || 'Assessment', error, {
      candidateId: req.params.id,
      error: error.message,
      errorCode: error.code
    });
    sendError(res, error.message || 'Failed to send assessment email', 500);
  }
}

async function revertAssessmentStatus(req, res) {
  try {
    const candidate = await candidateService.findById(req.params.id);
    
    if (!candidate) {
      logger.error('ASSESSMENT', 'Candidate not found for assessment revert', { candidateId: req.params.id });
      return sendError(res, 'Candidate not found', 404);
    }

    // Revert to INBOX status
    await candidateService.update(req.params.id, {
      assessment_given: 0,
      assessment_link: null,
      status: 'INBOX',
      round_stage: 'INBOX'
    });

    logger.success('ASSESSMENT', `Assessment status reverted for ${candidate.name}`, {
      candidateId: candidate.id,
      email: candidate.email
    });

    sendSuccess(res, 'Assessment status reverted successfully');
  } catch (error) {
    logger.error('ASSESSMENT', 'Failed to revert assessment status', {
      candidateId: req.params.id,
      error: error.message
    });
    sendError(res, error.message || 'Failed to revert assessment status', 500);
  }
}

async function sendMeetingInvite(req, res) {
  let candidate = null;
  try {
    const { subject, body, meetLink, dateTime } = req.body;
    candidate = await candidateService.findById(req.params.id);
    
    if (!candidate) {
      return sendError(res, 'Candidate not found', 404);
    }
    
    // Send email via Gmail API
    const emailResult = await emailService.sendEmail({
      to: candidate.email,
      subject,
      body
    });
    
    // Update candidate status
    await candidateService.update(req.params.id, {
      status: 'SCHEDULED',
      round_stage: 'SCHEDULED',
      interview_date: dateTime,
      meet_link: meetLink
    });
    
    // Store message in database
    const { v4: uuidv4 } = require('uuid');
    const { query } = require('../database/db');
    await query(`
      INSERT INTO messages (id, candidate_id, gmail_message_id, direction, subject, body, is_read, created_at)
      VALUES (?, ?, ?, 'SENT', ?, ?, 1, CURRENT_TIMESTAMP)
    `, [uuidv4(), candidate.id, emailResult.messageId, subject, body]);
    
    // Create notification
    await query(`
      INSERT INTO notifications (id, type, title, message, candidate_id, candidate_name, is_read, created_at)
      VALUES (?, 'INTERVIEW_SCHEDULED', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      `Interview Scheduled: ${candidate.name}`,
      `Interview scheduled for ${new Date(dateTime).toLocaleString()}`,
      candidate.id,
      candidate.name
    ]);
    
    logger.success('MEETING_INVITE', `Meeting invitation sent to ${candidate.name}`, {
      candidateId: candidate.id,
      email: candidate.email,
      meetLink,
      dateTime
    });
    
    sendSuccess(res, 'Meeting invitation sent successfully');
  } catch (error) {
    logger.error('MEETING_INVITE', 'Failed to send meeting invitation', {
      candidateId: req.params.id,
      error: error.message
    });
    sendError(res, error.message || 'Failed to send meeting invitation', 500);
  }
}

async function rescheduleInterview(req, res) {
  try {
    const { subject, body, dateTime } = req.body;
    const candidate = await candidateService.findById(req.params.id);
    
    if (!candidate) {
      return sendError(res, 'Candidate not found', 404);
    }

    if (candidate.status !== 'SCHEDULED') {
      return sendError(res, 'Only scheduled interviews can be rescheduled', 400);
    }

    const oldDateTime = candidate.interview_date;
    const newDateTime = new Date(dateTime);

    // Send reschedule email
    const emailResult = await emailService.sendEmail({
      to: candidate.email,
      subject,
      body
    });

    // Update calendar event if calendar_event_id exists
    if (candidate.calendar_event_id) {
      try {
        const calendarService = require('../services/calendar.service');
        await calendarService.updateEvent(candidate.calendar_event_id, {
          start: dateTime,
          end: new Date(new Date(dateTime).getTime() + 60 * 60 * 1000).toISOString(), // +1 hour
          summary: `Interview: ${candidate.name} - ${candidate.position}`,
          description: `Rescheduled interview\nMeet Link: ${candidate.meet_link}`
        });
        logger.success('RESCHEDULE', `Calendar event updated for ${candidate.name}`);
      } catch (calError) {
        logger.error('RESCHEDULE', 'Failed to update calendar event', { error: calError.message });
        // Continue even if calendar update fails
      }
    }

    // Update candidate interview date
    await candidateService.update(req.params.id, {
      interview_date: dateTime
    });

    // Store reschedule message
    const { v4: uuidv4 } = require('uuid');
    const { query } = require('../database/db');
    await query(`
      INSERT INTO messages (id, candidate_id, gmail_message_id, direction, subject, body, is_read, created_at)
      VALUES (?, ?, ?, 'SENT', ?, ?, 1, CURRENT_TIMESTAMP)
    `, [uuidv4(), candidate.id, emailResult.messageId, subject, body]);

    // Create notification
    await query(`
      INSERT INTO notifications (id, type, title, message, candidate_id, candidate_name, is_read, created_at)
      VALUES (?, 'INTERVIEW_RESCHEDULED', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `, [
      uuidv4(),
      `Interview Rescheduled: ${candidate.name}`,
      `Interview rescheduled from ${new Date(oldDateTime).toLocaleString()} to ${newDateTime.toLocaleString()}`,
      candidate.id,
      candidate.name
    ]);

    logger.success('RESCHEDULE', `Interview rescheduled for ${candidate.name}`, {
      candidateId: candidate.id,
      oldDateTime,
      newDateTime
    });

    sendSuccess(res, 'Interview rescheduled successfully');
  } catch (error) {
    logger.error('RESCHEDULE', 'Failed to reschedule interview', {
      candidateId: req.params.id,
      error: error.message
    });
    sendError(res, error.message || 'Failed to reschedule interview', 500);
  }
}

module.exports = {
  createCandidate,
  bulkUploadCV,
  getCandidates,
  getCandidateById,
  updateCandidate,
  updateCandidateStatus,
  shortlistCandidate,
  archiveCandidate,
  deleteCandidate,
  getMetrics,
  exportCsv,
  generateAssessmentEmail,
  sendAssessmentEmail,
  revertAssessmentStatus,
  sendMeetingInvite,
  rescheduleInterview,
};
