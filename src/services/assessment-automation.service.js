const { query } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const { aiProcessor } = require('../workers/ai.processor');
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
      
      logger.info('ASSESSMENT_ANALYSIS', 'Profile analysis complete', { 
        seniority: analysis.seniority,
        techStack: analysis.techStack,
        uniqueStrength: analysis.uniqueStrength
      });
      
      // Generate assessment using AI
      const assessmentPrompt = this.buildAssessmentPrompt(candidate, analysis, jobDescription);
      const assessmentContent = await aiProcessor.generateAssessment(assessmentPrompt);
      
      // Ensure we have all required fields
      const result = {
        title: assessmentContent?.title || `Technical Assessment for ${candidate.position}`,
        content: assessmentContent?.content || 'Assessment content generation failed',
        difficulty: assessmentContent?.difficulty || analysis.seniority || 'Mid-Level',
        techStack: assessmentContent?.techStack || analysis.techStack || ['JavaScript', 'Node.js'],
        uniqueStrength: assessmentContent?.uniqueStrength || analysis.uniqueStrength || 'Full-stack development'
      };
      
      logger.info('ASSESSMENT_RESULT', 'Assessment data prepared', {
        hasTitle: !!result.title,
        hasContent: !!result.content,
        difficulty: result.difficulty,
        techStackCount: result.techStack.length,
        uniqueStrength: result.uniqueStrength
      });
      
      return result;
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
   * Calculate seniority based on years of experience
   */
  calculateSeniority(yearsOfExperience) {
    if (yearsOfExperience < 0.5) return 'Intern';
    if (yearsOfExperience < 2) return 'Junior';
    if (yearsOfExperience < 5) return 'Mid-Level';
    return 'Senior';
  }

  /**
   * Analyze candidate profile to extract key information
   */
  async analyzeCandidateProfile(cvContent, position) {
    try {
      // Position is already normalized in the database, use it directly
      const analysisPrompt = `Analyze this candidate's CV for the position: ${position}

CV Content:
${cvContent.substring(0, 3000)}

Extract and return:
1. Years of Experience (total professional experience as a number, e.g., 0.5, 1.5, 3, 6)
2. Tech Stack (array of technologies they know)
3. Unique Strength (what makes them stand out - be specific, not generic)
4. Skill Gaps (areas they need to improve for this role - can be empty array if none)

Return as JSON with keys: yearsOfExperience (number), techStack (array), uniqueStrength (string), skillGaps (array)`;

      const analysis = await aiProcessor.analyzeProfile(analysisPrompt);
      
      // Calculate seniority based on experience
      const seniority = this.calculateSeniority(analysis.yearsOfExperience || 2);
      
      return {
        seniority,
        yearsOfExperience: analysis.yearsOfExperience || 2,
        techStack: analysis.techStack || ['JavaScript', 'Node.js'],
        uniqueStrength: analysis.uniqueStrength || 'Full-stack development',
        skillGaps: analysis.skillGaps || []
      };
    } catch (error) {
      // Fallback to basic analysis
      return {
        seniority: 'Mid-Level',
        yearsOfExperience: 2,
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
    // Use candidate.position directly - it's already normalized in the database
    const isSoftwareRole = /software|frontend|backend|full-stack|web|react|node|developer/i.test(candidate.position);
    
    return `Generate a technical assessment for a candidate applying for: ${candidate.position}

CANDIDATE PROFILE:
- Name: ${candidate.name}
- Position: ${candidate.position}
- Seniority: ${analysis.seniority}
- Years of Experience: ${analysis.yearsOfExperience || 2}
- Tech Stack: ${analysis.techStack.join(', ')}
- Unique Strength: ${analysis.uniqueStrength}
- Skill Gaps: ${analysis.skillGaps.join(', ') || 'None identified'}

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

UNIQUE STRENGTH INTEGRATION:
- DO NOT use placeholders like "[Unique Strength]" or "[Skill Gaps]"
- REPLACE with actual values: "${analysis.uniqueStrength}" and "${analysis.skillGaps.join(', ') || 'system design and scalability'}"
- Build one challenge specifically around their strength: "${analysis.uniqueStrength}"
${analysis.skillGaps.length > 0 ? `- Address their gaps (${analysis.skillGaps.join(', ')}) in the assessment design` : ''}

${isSoftwareRole ? `FRONTEND REQUIREMENT:
- This is a software development role
- MUST include a frontend component in the assessment
- Specify UI/UX requirements (React, Next.js, or similar)
- Include design mockups or wireframe expectations
- Mention responsive design and user experience criteria` : ''}

CRITICAL RULES:
1. NO PLACEHOLDERS - Use actual values from the candidate profile
2. Replace "[Unique Strength]" with: ${analysis.uniqueStrength}
3. Replace "[Skill Gaps]" with: ${analysis.skillGaps.join(', ') || 'advanced system architecture'}
4. Make challenges specific and actionable
5. Include exact tech stack from their CV: ${analysis.techStack.join(', ')}

Format the response as:
{
  "title": "Assessment Title",
  "content": "Full assessment markdown content with sections, code examples, and evaluation criteria. NO PLACEHOLDERS ALLOWED.",
  "difficulty": "${analysis.seniority}",
  "techStack": ${JSON.stringify(analysis.techStack)},
  "uniqueStrength": "${analysis.uniqueStrength}"
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
      // Use candidate.position directly - it's already normalized in the database
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

      // Generate email (position is already normalized in candidate.position)
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

      // Update candidate status and save assessment link
      await query(
        `UPDATE candidates 
         SET assessment_status = ?, 
             assessment_sent_at = CURRENT_TIMESTAMP,
             assessment_link = ?,
             assessment_given = 1,
             status = 'ASSESSMENT',
             round_stage = 'ASSESSMENT'
         WHERE id = ?`,
        ['sent', pdfFileName, candidateId]
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
   * Process INBOX candidates (for cron job or manual trigger)
   * @param {number|null} limit - Optional limit for batch processing (null = all up to 50)
   */
  async processInboxCandidates(limit = null) {
    try {
      const settings = await this.getAutomationSettings();

      // Get INBOX candidates without assessment
      const maxLimit = limit || 50; // Default to 50 if no limit specified
      const candidates = await query(`
        SELECT * FROM candidates 
        WHERE status = 'INBOX' 
        AND round_stage = 'INBOX'
        AND (assessment_status IS NULL OR assessment_status = 'failed')
        AND assessment_retry_count < 3
        ORDER BY created_at ASC
        LIMIT ?
      `, [maxLimit]);

      logger.info('AUTOMATION_PROCESS', `Found ${candidates.length} candidates to process`);

      const results = {
        processed: 0,
        skipped: 0,
        failed: 0
      };

      // If called manually (with limit), process all regardless of automation mode
      const isManualTrigger = limit !== null;

      for (const candidate of candidates) {
        try {
          // Check per-candidate override
          const mode = candidate.automation_mode || settings.mode;
          
          // Process if manual trigger OR if automation mode is 'automated'
          if (isManualTrigger || mode === 'automated') {
            await this.processCandidateAssessment(candidate.id, 'send');
            results.processed++;
          } else {
            results.skipped++;
          }
        } catch (error) {
          logger.error('AUTOMATION_PROCESS', `Failed for candidate ${candidate.name}`, { error: error.message });
          results.failed++;
        }
      }

      logger.success('AUTOMATION_PROCESS', 'Batch processing completed', results);
      return results;
    } catch (error) {
      logger.error('AUTOMATION_PROCESS', 'Processing failed', { error: error.message });
      throw error;
    }
  }
}

module.exports = new AssessmentAutomationService();
