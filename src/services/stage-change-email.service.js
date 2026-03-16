const emailService = require('./email.service');
const logger = require('./logger.service');
const { aiProcessor } = require('../workers/ai.processor');

class StageChangeEmailService {
  /**
   * Send email when candidate is moved to SHORTLIST
   */
  async sendShortlistEmail(candidate) {
    try {
      const subject = `Congratulations! You've Been Shortlisted - ${candidate.position}`;
      
      const body = `Dear ${candidate.name},

Congratulations! We're pleased to inform you that you've been shortlisted for the ${candidate.position} position at Limi AI.

Your application stood out among many talented candidates, and we're impressed with your qualifications and experience.

Next Steps:
We will be in touch shortly with details about the next stage of our recruitment process.

Thank you for your interest in joining our team. We look forward to speaking with you soon!

Best regards,
Limi AI Recruitment Team`;

      await emailService.sendEmail({
        to: candidate.email,
        subject,
        body
      });

      logger.success('STAGE_EMAIL', `Shortlist email sent to ${candidate.name}`, {
        candidateId: candidate.id,
        stage: 'SHORTLIST'
      });

      return { success: true };
    } catch (error) {
      logger.error('STAGE_EMAIL', 'Failed to send shortlist email', {
        error: error.message,
        candidateId: candidate.id
      });
      throw error;
    }
  }

  /**
   * Generate and send email when candidate is moved to INTERVIEW
   * This generates a template that should be reviewed before sending
   */
  async generateInterviewEmail(candidate, previousStage) {
    try {
      // Generate personalized email using AI
      const emailPrompt = `Generate a professional email to inform a candidate they are moving to the interview stage.

Candidate: ${candidate.name}
Position: ${candidate.position}
Previous Stage: ${previousStage}

The email should:
- Be warm and encouraging
- Inform them they're moving to the interview stage
- Mention that interview details will be sent separately
- Keep it concise (under 150 words)

Return only the email body text, no subject line.`;

      const emailBody = await aiProcessor.generateEmail(
        candidate.name,
        candidate.position,
        'Interview Stage',
        'TBD',
        30
      );

      const subject = `Interview Stage - ${candidate.position} Position`;
      
      const body = emailBody || `Dear ${candidate.name},

We're pleased to inform you that you've successfully moved to the interview stage for the ${candidate.position} position at Limi AI.

Your performance in the previous rounds has been impressive, and we're excited to learn more about you.

Interview Details:
We will send you the interview schedule and meeting link separately within the next 24 hours.

If you have any questions in the meantime, please don't hesitate to reach out.

Best regards,
Limi AI Recruitment Team`;

      return {
        subject,
        body,
        candidateEmail: candidate.email
      };
    } catch (error) {
      logger.error('STAGE_EMAIL', 'Failed to generate interview email', {
        error: error.message,
        candidateId: candidate.id
      });
      
      // Return fallback template
      return {
        subject: `Interview Stage - ${candidate.position} Position`,
        body: `Dear ${candidate.name},

We're pleased to inform you that you've successfully moved to the interview stage for the ${candidate.position} position at Limi AI.

Interview details will be sent separately.

Best regards,
Limi AI Recruitment Team`,
        candidateEmail: candidate.email
      };
    }
  }

  /**
   * Send email when candidate is moved to INTERVIEW (after review)
   */
  async sendInterviewEmail(candidate, emailData) {
    try {
      await emailService.sendEmail({
        to: candidate.email,
        subject: emailData.subject,
        body: emailData.body
      });

      logger.success('STAGE_EMAIL', `Interview stage email sent to ${candidate.name}`, {
        candidateId: candidate.id,
        stage: 'INTERVIEW'
      });

      return { success: true };
    } catch (error) {
      logger.error('STAGE_EMAIL', 'Failed to send interview email', {
        error: error.message,
        candidateId: candidate.id
      });
      throw error;
    }
  }

  /**
   * Send rejection email based on previous stage
   */
  async sendRejectionEmail(candidate, previousStage) {
    try {
      let subject, body;

      if (previousStage === 'ASSESSMENT') {
        // Rejected from assessment stage
        subject = `Application Update - ${candidate.position} Position`;
        body = `Dear ${candidate.name},

Thank you for taking the time to complete the technical assessment for the ${candidate.position} position at Limi AI.

After careful review, we regret to inform you that we will not be moving forward with your application at this time. While your skills and experience are impressive, we have decided to proceed with candidates whose profiles more closely align with our current requirements.

We appreciate the effort you put into the assessment and encourage you to apply for future opportunities that match your expertise.

We wish you all the best in your job search and future endeavors.

Best regards,
Limi AI Recruitment Team`;

      } else if (previousStage === 'INTERVIEW' || previousStage === 'SCHEDULED') {
        // Rejected after interview
        subject = `Application Update - ${candidate.position} Position`;
        body = `Dear ${candidate.name},

Thank you for taking the time to interview with us for the ${candidate.position} position at Limi AI.

We appreciate the opportunity to learn more about your background and experience. After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.

This was a difficult decision, as we were impressed by your skills and professionalism throughout the interview process.

We encourage you to apply for future positions at Limi AI that align with your expertise, and we wish you continued success in your career.

Best regards,
Limi AI Recruitment Team`;

      } else {
        // Generic rejection
        subject = `Application Update - ${candidate.position} Position`;
        body = `Dear ${candidate.name},

Thank you for your interest in the ${candidate.position} position at Limi AI.

After careful review of your application, we have decided to move forward with other candidates at this time.

We appreciate the time you invested in applying and wish you the best of luck in your job search.

Best regards,
Limi AI Recruitment Team`;
      }

      await emailService.sendEmail({
        to: candidate.email,
        subject,
        body
      });

      logger.success('STAGE_EMAIL', `Rejection email sent to ${candidate.name}`, {
        candidateId: candidate.id,
        previousStage,
        stage: 'REJECTED'
      });

      return { success: true };
    } catch (error) {
      logger.error('STAGE_EMAIL', 'Failed to send rejection email', {
        error: error.message,
        candidateId: candidate.id
      });
      throw error;
    }
  }

  /**
   * Handle stage change and send appropriate email
   */
  async handleStageChange(candidate, newStage, previousStage) {
    try {
      logger.info('STAGE_CHANGE', `Handling stage change for ${candidate.name}`, {
        candidateId: candidate.id,
        from: previousStage,
        to: newStage
      });

      switch (newStage) {
        case 'SHORTLISTED':
          await this.sendShortlistEmail(candidate);
          break;

        case 'REJECTED':
          await this.sendRejectionEmail(candidate, previousStage);
          break;

        // INTERVIEW stage emails are generated but require manual review
        // So we don't auto-send them here
        default:
          logger.info('STAGE_CHANGE', `No automatic email for stage: ${newStage}`);
      }

      return { success: true };
    } catch (error) {
      logger.error('STAGE_CHANGE', 'Stage change email failed', {
        error: error.message,
        candidateId: candidate.id,
        newStage,
        previousStage
      });
      // Don't throw - stage change should succeed even if email fails
      return { success: false, error: error.message };
    }
  }
}

module.exports = new StageChangeEmailService();
