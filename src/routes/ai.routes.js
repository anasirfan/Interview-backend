const { Router } = require('express');
const { authenticate, authorize } = require('../middlewares/auth');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { aiProcessor } = require('../workers/ai.processor');
const activityLogService = require('../services/activityLog.service');
const candidateService = require('../services/candidate.service');
const fs = require('fs');
const path = require('path');

const router = Router();

router.use(authenticate);

router.post('/:id/analyze', authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const candidate = await candidateService.findById(req.params.id);
    if (!candidate) {
      sendError(res, 'Candidate not found', 404);
      return;
    }

    let cvText = '';
    if (candidate.cv_path) {
      const cvFullPath = path.join(process.cwd(), 'uploads', candidate.cv_path);
      if (fs.existsSync(cvFullPath)) {
        cvText = fs.readFileSync(cvFullPath, 'utf-8').slice(0, 8000);
      }
    }

    const result = await aiProcessor.analyzeCandidate(
      candidate.name, 
      candidate.position, 
      cvText || undefined
    );

    const updated = await candidateService.update(candidate.id, {
      key_highlights: result.highlights ? JSON.stringify(result.highlights) : candidate.key_highlights,
    });

    await activityLogService.create({
      action: 'AI_ANALYZE',
      entity: 'Candidate',
      entityId: candidate.id,
      details: `AI analyzed candidate: ${result.summary}`,
      adminId: req.user.id,
      candidateId: candidate.id,
    });

    sendSuccess(res, 'AI analysis complete', { ...updated, aiAnalysis: result });
  } catch (error) {
    sendError(res, error.message || 'AI analysis failed', 500);
  }
});

router.post('/:id/score', authorize('SUPER_ADMIN', 'HR_ADMIN', 'INTERVIEWER'), async (req, res) => {
  try {
    const candidate = await candidateService.findById(req.params.id);
    if (!candidate) {
      sendError(res, 'Candidate not found', 404);
      return;
    }

    let notes = req.body.notes || candidate.meeting_notes;
    if (!notes) {
      sendError(res, 'No interview notes available to score', 400);
      return;
    }

    // If notes is a Google Docs URL, fetch the actual text content
    if (notes.includes('docs.google.com') || notes.includes('drive.google.com')) {
      console.log('[AI Routes] Fetching notes text from Google Docs...');
      const { driveWorker } = require('../workers/drive.worker');
      const notesText = await driveWorker.fetchDocumentText(notes);
      
      if (notesText) {
        console.log(`[AI Routes] Fetched ${notesText.length} chars of notes text`);
        notes = notesText;
      } else {
        sendError(res, 'Could not fetch notes from Google Docs. Please ensure the document is accessible.', 500);
        return;
      }
    }

    const score = await aiProcessor.scoreInterview(notes, candidate.meet_transcript || undefined);
    if (!score) {
      sendError(res, 'AI scoring failed', 500);
      return;
    }

    const updated = await candidateService.update(candidate.id, {
      ai_score: score.overall_score,
      ai_feedback: JSON.stringify(score),
    });

    await activityLogService.create({
      action: 'AI_SCORE',
      entity: 'Candidate',
      entityId: candidate.id,
      details: `AI scored: ${score.overall_score}/5 - ${score.final_recommendation}`,
      adminId: req.user.id,
      candidateId: candidate.id,
    });

    sendSuccess(res, 'AI scoring complete', { ...updated, aiScore: score });
  } catch (error) {
    sendError(res, error.message || 'AI scoring failed', 500);
  }
});

router.post('/generate-email', authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const { candidateName, position, round, dateTime, duration } = req.body;
    if (!candidateName || !position) {
      sendError(res, 'candidateName and position required', 400);
      return;
    }

    const email = await aiProcessor.generateEmail(
      candidateName,
      position,
      round || 'Interview',
      dateTime || 'TBD',
      duration || 30
    );

    sendSuccess(res, 'Email generated', { emailBody: email });
  } catch (error) {
    sendError(res, error.message || 'Email generation failed', 500);
  }
});

router.post('/candidates/:id/interview-questions', authorize('SUPER_ADMIN', 'HR_ADMIN', 'INTERVIEWER'), async (req, res) => {
  try {
    const candidate = await candidateService.findById(req.params.id);
    if (!candidate) {
      sendError(res, 'Candidate not found', 404);
      return;
    }

    // Check if questions already exist (unless force regeneration requested)
    if (candidate.interview_questions && !req.body.force) {
      const existingQuestions = JSON.parse(candidate.interview_questions);
      sendSuccess(res, 'Interview questions already generated (use force=true to regenerate)', existingQuestions);
      return;
    }

    if (!candidate.cv_path) {
      sendError(res, 'No CV available for this candidate', 400);
      return;
    }

    // Read CV text
    const fs = require('fs');
    const path = require('path');
    const cvPath = path.join(process.cwd(), 'uploads', candidate.cv_path);
    
    let cvText = '';
    if (fs.existsSync(cvPath)) {
      if (candidate.cv_path.toLowerCase().endsWith('.pdf')) {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(cvPath);
        const pdfData = await pdfParse(dataBuffer);
        cvText = pdfData.text;
      } else {
        cvText = fs.readFileSync(cvPath, 'utf-8');
      }
    }

    if (!cvText || cvText.length < 50) {
      sendError(res, 'Could not extract text from CV', 500);
      return;
    }

    // Read assessment if available
    let assessmentText = '';
    if (candidate.assessment_link) {
      const assessmentPath = path.join(process.cwd(), 'uploads', 'assessments', candidate.assessment_link);
      if (fs.existsSync(assessmentPath)) {
        try {
          if (assessmentPath.toLowerCase().endsWith('.pdf')) {
            const pdfParse = require('pdf-parse');
            const dataBuffer = fs.readFileSync(assessmentPath);
            const pdfData = await pdfParse(dataBuffer);
            assessmentText = pdfData.text;
          } else {
            assessmentText = fs.readFileSync(assessmentPath, 'utf-8');
          }
        } catch (e) {
          console.log('[AI Routes] Could not read assessment file:', e.message);
        }
      }
    }

    const questions = await aiProcessor.generateInterviewQuestions(cvText, assessmentText);
    if (!questions) {
      sendError(res, 'Failed to generate interview questions', 500);
      return;
    }

    // Save questions to database
    await candidateService.update(req.params.id, {
      interview_questions: JSON.stringify(questions)
    });

    await activityLogService.create({
      action: 'AI_INTERVIEW_QUESTIONS',
      entity: 'Candidate',
      entityId: candidate.id,
      details: `Generated ${questions.questions?.length || 0} interview questions`,
      adminId: req.user.id,
      candidateId: candidate.id,
    });

    sendSuccess(res, 'Interview questions generated', questions);
  } catch (error) {
    sendError(res, error.message || 'Failed to generate interview questions', 500);
  }
});

router.post('/:id/generate-summary', authorize('SUPER_ADMIN', 'HR_ADMIN'), async (req, res) => {
  try {
    const candidate = await candidateService.findById(req.params.id);
    if (!candidate) {
      sendError(res, 'Candidate not found', 404);
      return;
    }

    // Check if summary already exists (unless force regeneration requested)
    if (candidate.ai_summary && !req.body.force) {
      const existingSummary = JSON.parse(candidate.ai_summary);
      sendSuccess(res, 'Summary already exists (use force=true to regenerate)', { 
        ...candidate, 
        summary: existingSummary 
      });
      return;
    }

    let cvText = '';
    if (candidate.cv_path) {
      const cvFullPath = path.join(process.cwd(), 'uploads', candidate.cv_path);
      if (fs.existsSync(cvFullPath)) {
        try {
          // Check if it's a PDF file
          if (candidate.cv_path.toLowerCase().endsWith('.pdf')) {
            const pdfParse = require('pdf-parse');
            const dataBuffer = fs.readFileSync(cvFullPath);
            const pdfData = await pdfParse(dataBuffer);
            cvText = pdfData.text;
            console.log(`[AI] Extracted ${cvText.length} characters from PDF: ${candidate.cv_path}`);
          } else {
            // For text files, read as UTF-8
            cvText = fs.readFileSync(cvFullPath, 'utf-8');
          }
        } catch (error) {
          console.error('[AI] CV parsing error:', error);
          sendError(res, 'Failed to parse CV file', 500);
          return;
        }
      }
    }

    if (!cvText || cvText.trim().length === 0) {
      sendError(res, 'No CV content available for analysis', 400);
      return;
    }

    const summary = await aiProcessor.generateComprehensiveSummary(candidate.name, cvText);
    if (!summary) {
      sendError(res, 'Failed to generate summary', 500);
      return;
    }

    const updated = await candidateService.update(candidate.id, {
      ai_summary: JSON.stringify(summary)
    });

    await activityLogService.create({
      action: 'AI_SUMMARY',
      entity: 'Candidate',
      entityId: candidate.id,
      details: `AI generated comprehensive summary for ${candidate.name}`,
      adminId: req.user.id,
      candidateId: candidate.id,
    });

    sendSuccess(res, 'Summary generated successfully', { ...updated, summary });
  } catch (error) {
    sendError(res, error.message || 'Summary generation failed', 500);
  }
});

router.get('/:id/view-cv', authenticate, async (req, res) => {
  try {
    const candidate = await candidateService.findById(req.params.id);
    if (!candidate) {
      sendError(res, 'Candidate not found', 404);
      return;
    }

    if (!candidate.cv_path) {
      sendError(res, 'No CV available', 404);
      return;
    }

    const cvFullPath = path.join(process.cwd(), 'uploads', candidate.cv_path);
    if (!fs.existsSync(cvFullPath)) {
      sendError(res, 'CV file not found', 404);
      return;
    }

    let cvText = '';
    try {
      if (candidate.cv_path.toLowerCase().endsWith('.pdf')) {
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(cvFullPath);
        const pdfData = await pdfParse(dataBuffer);
        cvText = pdfData.text;
      } else {
        cvText = fs.readFileSync(cvFullPath, 'utf-8');
      }
    } catch (error) {
      console.error('[AI] CV parsing error:', error);
      sendError(res, 'Failed to parse CV file', 500);
      return;
    }

    sendSuccess(res, 'CV retrieved', { 
      cvText,
      fileName: candidate.cv_path,
      candidateName: candidate.name
    });
  } catch (error) {
    sendError(res, error.message || 'Failed to retrieve CV', 500);
  }
});

// Generate meeting invitation email template
router.post('/generate-meeting-email', authenticate, async (req, res) => {
  try {
    const { candidateName, position, round, dateTime, meetLink, duration } = req.body;
    
    const date = new Date(dateTime);
    const formattedDate = date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const formattedTime = date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
    
    const meetingDuration = duration || 30; // Default to 30 minutes
    
    const subject = `Interview Invitation: ${round} at LIMI AI | ${candidateName}`;
    
    const body = `Dear ${candidateName},

We are pleased to invite you to the next stage of our hiring process for the ${position} position at LIMI AI.

📅 Interview Details:
• Round: ${round}
• Date: ${formattedDate}
• Time: ${formattedTime}
• Duration: ${meetingDuration} minutes
• Platform: Google Meet

🔗 Join the meeting:
${meetLink}

📋 What to expect:
This interview will focus on assessing your technical skills, problem-solving abilities, and cultural fit with our team. Please ensure you have a stable internet connection and a quiet environment for the interview.

💡 Preparation tips:
• Review your resume and be ready to discuss your experience
• Prepare questions about the role and company
• Test your audio and video before the meeting
• Join 5 minutes early to ensure everything is working properly

If you need to reschedule or have any questions, please don't hesitate to reach out.

We look forward to speaking with you!

Best regards,
LIMI AI Recruitment Team`;
    
    sendSuccess(res, 'Meeting email template generated', { subject, body });
  } catch (error) {
    sendError(res, error.message || 'Failed to generate email template', 500);
  }
});

// Generate AI reply suggestion for messages
router.post('/generate-reply', authenticate, async (req, res) => {
  try {
    const { candidateName, candidateMessage, context } = req.body;
    const { aiProcessor } = require('../workers/ai.processor');
    
    const prompt = `You are a professional HR recruiter at LIMI AI. Generate a professional, friendly email reply to the following message from a candidate.

Candidate Name: ${candidateName}
Candidate's Message: ${candidateMessage}
${context ? `Context: ${context}` : ''}

Generate a professional reply that:
- Is warm and professional
- Addresses their message directly
- Maintains a positive tone
- Is concise (2-3 paragraphs max)
- Signs off appropriately

Reply:`;

    const reply = await aiProcessor.generateText(prompt);
    
    sendSuccess(res, 'AI reply generated', { reply: reply.trim() });
  } catch (error) {
    sendError(res, error.message || 'Failed to generate AI reply', 500);
  }
});

module.exports = router;
