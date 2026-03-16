const { query } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const aiProcessor = require('../workers/ai.processor');
const pdfService = require('./pdf.service');
const emailService = require('./email.service');
const logger = require('./logger.service');

class AssessmentAutomationService {
  /**
   * Analyze CV and generate tailored assessment
   * @param {Object} candidate - Candidate data with CV content
   * @param {string} jobDescription - Job description text
   * @returns {Promise<Object>} Generated assessment content
   */
  async generateTailoredAssessment(candidate, jobDescription) {
    try {
      logger.info('ASSESSMENT_GEN', `Generating assessment for ${candidate.name}`, { candidateId: candidate.id });

      // Extract CV content from file
      const cvContent = await this.extractCVContent(candidate.cv_path);
      
      // Analyze candidate profile
      const analysis = await this.analyzeCandidateProfile(cvContent, candidate.position);
      
      // Generate assessment using AI
      const assessmentPrompt = this.buildAssessmentPrompt(candidate, analysis, jobDescription);
      const assessmentContent = await aiProcessor.generateAssessment(assessmentPrompt);
      
      return {
        title: assessmentContent.title,
        content: assessmentContent.content,
        difficulty: analysis.seniority,
        techStack: analysis.techStack,
        uniqueStrength: analysis.uniqueStrength
      };
    } catch (error) {
      logger.error('ASSESSMENT_GEN', 'Failed to generate assessment', { error: error.message, candidateId: candidate.id });
      throw error;
    }
  }

  /**
   * Extract text content from CV PDF
   */
  async extractCVContent(cvPath) {
    try {
      if (!cvPath) {
        throw new Error('CV path not provided');
      }

      const fullPath = path.join(process.cwd(), 'uploads', cvPath);
      
      // Check if file exists
      await fs.access(fullPath);
      
      // For now, we'll use the AI summary if available
      // In production, you might want to use pdf-parse library
      return `CV file: ${cvPath}`;
    } catch (error) {
      logger.error('CV_EXTRACT', 'Failed to extract CV content', { error: error.message, cvPath });
      throw new Error('Failed to extract CV content');
    }
  }

  /**
   * Analyze candidate profile to determine seniority, tech stack, strengths
   */
  async analyzeCandidateProfile(cvContent, position) {
    try {
      const analysisPrompt = `Analyze this candidate profile and extract:
1. Seniority Level (Junior/Mid/Senior)
2. Core Tech Stack (list main technologies)
3. Unique Strength (their standout project or skill)
4. Skill Gaps (what's missing for the role)

Position: ${position}
CV Content: ${cvContent}

Return as JSON with keys: seniority, techStack (array), uniqueStrength, skillGaps (array)`;

      const analysis = await aiProcessor.analyzeProfile(analysisPrompt);
      return analysis;
    } catch (error) {
      // Fallback to basic analysis
      return {
        seniority: 'Mid',
        techStack: ['JavaScript', 'Node.js', 'React'],
        uniqueStrength: 'Full-stack development',
        skillGaps: []
      };
    }
  }

  /**
   * Build comprehensive assessment prompt for AI
   */
  buildAssessmentPrompt(candidate, analysis, jobDescription) {
    return `Generate a technical assessment for a candidate applying for: ${candidate.position}

CANDIDATE PROFILE:
- Name: ${candidate.name}
- Seniority: ${analysis.seniority}
- Tech Stack: ${analysis.techStack.join(', ')}
- Unique Strength: ${analysis.uniqueStrength}
- Skill Gaps: ${analysis.skillGaps.join(', ')}

JOB DESCRIPTION:
${jobDescription || 'Full-stack developer position requiring strong problem-solving skills'}

ASSESSMENT REQUIREMENTS:
1. Create a compelling project title (like "The Intelligent Service Orchestrator")
2. Design 4 specific challenges:
   - 60% Core Skills (must-haves for the role)
   - 40% Dynamic Challenges (tailored to their CV and gaps)
3. Include:
   - Advanced architecture tasks
   - Real-world problem solving
   - Code quality expectations
   - Submission instructions with 48-hour deadline

SENIORITY CALIBRATION:
${analysis.seniority === 'Junior' ? '- Focus on Implementation: Can they build working features?' : ''}
${analysis.seniority === 'Mid' ? '- Balance Implementation and Design: Can they architect scalable solutions?' : ''}
${analysis.seniority === 'Senior' ? '- Focus on Architecture & Edge Cases: Can they handle high-scale systems?' : ''}

UNIQUE STRENGTH HOOK:
Build the assessment around their "${analysis.uniqueStrength}" to keep them engaged.

Format the response as:
{
  "title": "Assessment Title",
  "content": "Full assessment markdown content with sections, code examples, and evaluation criteria"
}`;
  }

  /**
   * Generate PDF from assessment content
   */
  async generateAssessmentPDF(assessmentData, candidate) {
    try {
      logger.info('PDF_GEN', `Generating PDF for ${candidate.name}`, { candidateId: candidate.id });

      const pdfBuffer = await pdfService.generateAssessmentPDF({
        title: assessmentData.title,
        content: assessmentData.content,
        candidateName: candidate.name,
        position: candidate.position,
        difficulty: assessmentData.difficulty
      });

      // Save PDF to uploads/assessments folder
      const fileName = `assessment-${candidate.id}-${Date.now()}.pdf`;
      const filePath = path.join(process.cwd(), 'uploads', 'assessments', fileName);
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, pdfBuffer);

      logger.success('PDF_GEN', `PDF generated: ${fileName}`, { candidateId: candidate.id });
      
      return fileName;
    } catch (error) {
      logger.error('PDF_GEN', 'Failed to generate PDF', { error: error.message, candidateId: candidate.id });
      throw error;
    }
  }

  /**
   * Generate assessment email template
   */
  async generateAssessmentEmail(candidate, assessmentData) {
    try {
      const emailPrompt = `Generate a professional email to send a technical assessment to a candidate.

Candidate: ${candidate.name}
Position: ${candidate.position}
Assessment Title: ${assessmentData.title}

The email should:
- Be warm and encouraging
- Explain the assessment is attached
- Mention 48-hour deadline
- Provide submission instructions (reply with GitHub repo link or Google Drive link)
- Wish them good luck

Return as JSON with keys: subject, body`;

      const emailContent = await aiProcessor.generateEmail(
        candidate.name,
        candidate.position,
        'Assessment',
        'TBD',
        48
      );

      return {
        subject: `Technical Assessment - ${candidate.position} Position`,
        body: emailContent
      };
    } catch (error) {
      // Fallback template
      return {
        subject: `Technical Assessment - ${candidate.position} Position`,
        body: `Dear ${candidate.name},

Thank you for your interest in the ${candidate.position} position at Limi AI.

We're excited to move forward with your application! Please find attached your technical assessment: "${assessmentData.title}".

Assessment Details:
- Deadline: 48 hours from now
- Submission: Reply to this email with your GitHub repository link or Google Drive link

This assessment is designed to showcase your skills and problem-solving abilities. Take your time and demonstrate your best work.

If you have any questions, feel free to reach out.

Best of luck!

Best regards,
Limi AI Recruitment Team`
      };
    }
  }

  /**
   * Process a single candidate for assessment automation
   */
  async processCandidateAssessment(candidateId, mode = 'preview') {
    try {
      // Get candidate data
      const candidates = await query('SELECT * FROM candidates WHERE id = ?', [candidateId]);
      if (!candidates || candidates.length === 0) {
        throw new Error('Candidate not found');
      }

      const candidate = candidates[0];

      // Check if already processed
      if (candidate.assessment_status === 'sent' && mode !== 'retry') {
        logger.info('ASSESSMENT_SKIP', `Assessment already sent for ${candidate.name}`, { candidateId });
        return { status: 'skipped', reason: 'already_sent' };
      }

      // Update status to processing
      await query(
        'UPDATE candidates SET assessment_status = ? WHERE id = ?',
        ['processing', candidateId]
      );

      // Get job description (you might want to store this in DB)
      const jobDescription = `Full-stack developer position at Limi AI requiring expertise in ${candidate.position}`;

      // Generate assessment
      const assessmentData = await this.generateTailoredAssessment(candidate, jobDescription);

      // Generate PDF
      const pdfFileName = await this.generateAssessmentPDF(assessmentData, candidate);

      // Generate email
      const emailData = await this.generateAssessmentEmail(candidate, assessmentData);

      // Update candidate record
      await query(
        `UPDATE candidates 
         SET assessment_link = ?, 
             assessment_status = ?, 
             assessment_generated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [pdfFileName, 'generated', candidateId]
      );

      const result = {
        status: 'generated',
        candidateId,
        candidateName: candidate.name,
        assessmentData,
        pdfFileName,
        emailData
      };

      // If mode is 'send', send the email immediately
      if (mode === 'send') {
        await this.sendAssessmentEmail(candidateId, emailData, pdfFileName);
        result.status = 'sent';
      }

      logger.success('ASSESSMENT_PROCESS', `Assessment ${mode} for ${candidate.name}`, { candidateId, mode });
      
      return result;
    } catch (error) {
      // Update status to failed
      await query(
        `UPDATE candidates 
         SET assessment_status = ?, 
             assessment_retry_count = assessment_retry_count + 1
         WHERE id = ?`,
        ['failed', candidateId]
      );

      logger.error('ASSESSMENT_PROCESS', 'Failed to process assessment', { error: error.message, candidateId });
      throw error;
    }
  }

  /**
   * Send assessment email with PDF attachment
   */
  async sendAssessmentEmail(candidateId, emailData, pdfFileName) {
    try {
      const candidates = await query('SELECT * FROM candidates WHERE id = ?', [candidateId]);
      const candidate = candidates[0];

      const pdfPath = path.join(process.cwd(), 'uploads', 'assessments', pdfFileName);

      await emailService.sendEmailWithAttachment({
        to: candidate.email,
        subject: emailData.subject,
        body: emailData.body,
        attachmentPath: pdfPath,
        attachmentName: `Assessment-${candidate.name.replace(/\s+/g, '-')}.pdf`
      });

      // Update candidate status
      await query(
        `UPDATE candidates 
         SET assessment_status = ?, 
             assessment_sent_at = CURRENT_TIMESTAMP,
             status = 'ASSESSMENT',
             round_stage = 'ASSESSMENT'
         WHERE id = ?`,
        ['sent', candidateId]
      );

      logger.success('ASSESSMENT_SEND', `Assessment sent to ${candidate.name}`, { candidateId });
    } catch (error) {
      logger.error('ASSESSMENT_SEND', 'Failed to send assessment email', { error: error.message, candidateId });
      throw error;
    }
  }

  /**
   * Get automation settings
   */
  async getAutomationSettings() {
    try {
      const settings = await query('SELECT * FROM automation_settings WHERE id = ?', ['global']);
      return settings && settings.length > 0 ? settings[0] : { id: 'global', mode: 'off' };
    } catch (error) {
      return { id: 'global', mode: 'off' };
    }
  }

  /**
   * Update automation settings
   */
  async updateAutomationSettings(mode) {
    try {
      await query(
        `INSERT INTO automation_settings (id, mode, updated_at) 
         VALUES ('global', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET mode = ?, updated_at = CURRENT_TIMESTAMP`,
        [mode, mode]
      );
      logger.success('AUTOMATION_SETTINGS', `Automation mode updated to: ${mode}`);
    } catch (error) {
      logger.error('AUTOMATION_SETTINGS', 'Failed to update settings', { error: error.message });
      throw error;
    }
  }

  /**
   * Process all INBOX candidates (for cron job)
   */
  async processInboxCandidates() {
    try {
      const settings = await this.getAutomationSettings();
      
      if (settings.mode === 'off') {
        logger.info('AUTOMATION_CRON', 'Automation is OFF, skipping');
        return { processed: 0, skipped: 0, failed: 0 };
      }

      // Get all INBOX candidates without assessment
      const candidates = await query(`
        SELECT * FROM candidates 
        WHERE status = 'INBOX' 
        AND round_stage = 'INBOX'
        AND (assessment_status IS NULL OR assessment_status = 'failed')
        AND assessment_retry_count < 3
        ORDER BY created_at ASC
        LIMIT 50
      `);

      logger.info('AUTOMATION_CRON', `Found ${candidates.length} candidates to process`);

      const results = {
        processed: 0,
        skipped: 0,
        failed: 0
      };

      for (const candidate of candidates) {
        try {
          // Check per-candidate override
          const mode = candidate.automation_mode || settings.mode;
          
          if (mode === 'automated') {
            await this.processCandidateAssessment(candidate.id, 'send');
            results.processed++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          logger.error('AUTOMATION_CRON', `Failed for candidate ${candidate.name}`, { error: error.message });
          results.failed++;
        }
      }

      logger.success('AUTOMATION_CRON', 'Batch processing completed', results);
      return results;
    } catch (error) {
      logger.error('AUTOMATION_CRON', 'Cron job failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AssessmentAutomationService();
