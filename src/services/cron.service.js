const cron = require('node-cron');
const { gmailWorker } = require('../workers/gmail.worker');
const { get, run, query } = require('../database/db');
const { generateUUID } = require('../utils/uuid');

class CronService {
  constructor() {
    this.jobs = {};
    this.isInitialized = false;
    this.jobsRunning = {
      gmailFetch: false,
      replyCheck: false,
      healthCheck: false,
      statusTransition: false,
      autoMatchRecordings: false
    };
  }

  async logCronExecution(jobName, status, duration, message, error = null) {
    try {
      const id = generateUUID();
      await run(`
        INSERT INTO cron_logs (id, job_name, status, duration, message, error)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, jobName, status, duration, message, error]);
    } catch (err) {
      console.error('[CronService] Failed to log execution:', err.message);
    }
  }

  async triggerGmailProcessing() {
    const startTime = Date.now();
    console.log('[CronService] Manual Gmail processing triggered');
    
    try {
      const admin = await get(
        'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
      );

      if (!admin) {
        const message = 'No Google OAuth tokens configured';
        await this.logCronExecution('gmail_fetch', 'SKIPPED', 0, message);
        return { success: false, message };
      }

      const processed = await gmailWorker.fetchNewEmails();
      const duration = Date.now() - startTime;
      const message = `Processed ${processed.length} emails`;
      
      await this.logCronExecution('gmail_fetch', 'SUCCESS', duration, message);
      console.log(`[CronService] Gmail processing completed: ${message} (${duration}ms)`);
      
      return { success: true, processed: processed.length, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logCronExecution('gmail_fetch', 'ERROR', duration, 'Failed', error.message);
      console.error('[CronService] Gmail processing error:', error.message);
      throw error;
    }
  }

  async triggerReplyCheck() {
    const startTime = Date.now();
    console.log('[CronService] Manual reply check triggered');
    
    try {
      const admin = await get(
        'SELECT * FROM admins WHERE google_token IS NOT NULL AND google_refresh IS NOT NULL LIMIT 1'
      );

      if (!admin) {
        const message = 'No Google OAuth tokens configured';
        await this.logCronExecution('reply_check', 'SKIPPED', 0, message);
        return { success: false, message };
      }

      await gmailWorker.checkAssessmentReplies();
      const duration = Date.now() - startTime;
      const message = 'Assessment replies checked';
      
      await this.logCronExecution('reply_check', 'SUCCESS', duration, message);
      console.log(`[CronService] Reply check completed (${duration}ms)`);
      
      return { success: true, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logCronExecution('reply_check', 'ERROR', duration, 'Failed', error.message);
      console.error('[CronService] Reply check error:', error.message);
      throw error;
    }
  }

  async healthCheck() {
    const startTime = Date.now();
    
    try {
      const admin = await get('SELECT COUNT(*) as count FROM admins');
      const candidates = await get('SELECT COUNT(*) as count FROM candidates');
      
      const duration = Date.now() - startTime;
      const message = `Health OK - ${admin.count} admins, ${candidates.count} candidates`;
      
      await this.logCronExecution('health_check', 'SUCCESS', duration, message);
      console.log(`[CronService] ${message}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logCronExecution('health_check', 'ERROR', duration, 'Failed', error.message);
      console.error('[CronService] Health check error:', error.message);
    }
  }

  async checkScheduledInterviews() {
    const startTime = Date.now();
    console.log('[CronService] Checking scheduled interviews for status transition...');
    
    try {
      // Find all SCHEDULED candidates whose interview_date has passed
      const now = new Date().toISOString();
      console.log(`[CronService] Current time (ISO): ${now}`);
      
      const scheduledCandidates = await query(`
        SELECT id, name, interview_date, status, round_stage
        FROM candidates 
        WHERE status = 'SCHEDULED' 
          AND interview_date IS NOT NULL 
          AND interview_date < ?
          AND is_archived = 0
      `, [now]);

      console.log(`[CronService] Found ${scheduledCandidates.length} SCHEDULED candidates with past interview dates`);
      if (scheduledCandidates.length > 0) {
        console.log('[CronService] Candidates to transition:', scheduledCandidates.map(c => ({ 
          name: c.name, 
          interview_date: c.interview_date, 
          status: c.status 
        })));
      }

      let transitioned = 0;
      for (const candidate of scheduledCandidates) {
        // Transition to INTERVIEW status
        await run(`
          UPDATE candidates 
          SET status = 'INTERVIEW', 
              round_stage = 'INTERVIEW',
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [candidate.id]);

        console.log(`[CronService] Transitioned ${candidate.name} from SCHEDULED to INTERVIEW`);
        transitioned++;
      }

      const duration = Date.now() - startTime;
      const message = `Transitioned ${transitioned} candidates from SCHEDULED to INTERVIEW`;
      
      await this.logCronExecution('status_transition', 'SUCCESS', duration, message);
      console.log(`[CronService] ${message} (${duration}ms)`);
      
      return { success: true, transitioned, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logCronExecution('status_transition', 'ERROR', duration, 'Failed', error.message);
      console.error('[CronService] Status transition error:', error.message);
      throw error;
    }
  }

  async autoMatchRecordingsAndNotes() {
    const startTime = Date.now();
    console.log('[CronService] Auto-matching recordings and notes...');
    
    try {
      const { driveWorker } = require('../workers/drive.worker');
      const { aiProcessor } = require('../workers/ai.processor');
      
      // Find candidates whose interview ended 15+ minutes ago and don't have recordings yet
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const candidates = await query(`
        SELECT id, name, position, interview_date, meet_link
        FROM candidates 
        WHERE status = 'INTERVIEW'
          AND interview_date IS NOT NULL 
          AND interview_date < ?
          AND (meeting_recording IS NULL OR meeting_notes IS NULL)
          AND is_archived = 0
      `, [fifteenMinutesAgo]);

      if (candidates.length === 0) {
        console.log('[CronService] No candidates ready for recording matching');
        await this.logCronExecution('auto_match_recordings', 'SUCCESS', Date.now() - startTime, 'No candidates ready');
        return { success: true, matched: 0 };
      }

      console.log(`[CronService] Found ${candidates.length} candidates ready for recording matching`);
      console.log('[CronService] Candidates:', candidates.map(c => ({ name: c.name, interview_date: c.interview_date, status: c.status })));

      // Scan Drive for recordings and notes
      const files = await driveWorker.scanRecordings();
      console.log(`[CronService] Drive files found:`, files.map(f => f.name));
      
      let matched = 0;
      for (const candidate of candidates) {
        // Build expected title pattern: "Technical Interview - Anas Irfan"
        // The actual files will be: "Technical Interview - Anas Irfan - 2026/03/05 21:05 PKT - Recording"
        const baseTitle = `${candidate.name}`;
        console.log(`[CronService] Searching for candidate: "${baseTitle}"`);
        
        // Find recording and notes files that match this candidate
        const recordingFile = files.find(f => 
          f.name.includes(baseTitle) && f.name.includes('Recording')
        );
        const notesFile = files.find(f => 
          f.name.includes(baseTitle) && (f.name.includes('Notes') || f.name.includes('Transcript'))
        );

        console.log(`[CronService] ${candidate.name} - Recording found: ${!!recordingFile}, Notes found: ${!!notesFile}`);
        if (recordingFile) console.log(`[CronService]   Recording file: "${recordingFile.name}"`);
        if (notesFile) console.log(`[CronService]   Notes file: "${notesFile.name}"`);

        if (recordingFile || notesFile) {
          const updateData = {};
          
          if (recordingFile) {
            updateData.meeting_recording = recordingFile.webViewLink || recordingFile.webContentLink;
            updateData.google_drive_link = recordingFile.webViewLink || recordingFile.webContentLink;
            console.log(`[CronService] Matched recording for ${candidate.name}: ${recordingFile.name}`);
          }
          
          if (notesFile) {
            updateData.meeting_notes = notesFile.webViewLink || notesFile.webContentLink;
            console.log(`[CronService] Matched notes for ${candidate.name}: ${notesFile.name}`);
          }

          // Update candidate with recording/notes links
          const updateFields = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
          const updateValues = Object.values(updateData);
          
          await run(`
            UPDATE candidates 
            SET ${updateFields}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [...updateValues, candidate.id]);

          matched++;

          // Trigger AI analysis and scoring
          try {
            console.log(`[CronService] Triggering AI analysis for ${candidate.name}...`);
            
            // AI Score Interview (using notes)
            if (notesFile && updateData.meeting_notes) {
              // Fetch actual text content from Google Docs
              console.log(`[CronService] Fetching notes text from Google Docs...`);
              const notesText = await driveWorker.fetchDocumentText(updateData.meeting_notes);
              
              if (notesText) {
                console.log(`[CronService] Fetched ${notesText.length} chars of notes text`);
                
                const scoreResult = await aiProcessor.scoreInterview(
                  notesText,
                  null // transcript not available yet
                );
                
                if (scoreResult) {
                  await run(`
                    UPDATE candidates 
                    SET ai_score = ?,
                        ai_feedback = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `, [scoreResult.overall_score, JSON.stringify(scoreResult), candidate.id]);
                  
                  console.log(`[CronService] AI scored ${candidate.name}: ${scoreResult.overall_score}/5`);
                }
              } else {
                console.log(`[CronService] Could not fetch notes text for ${candidate.name}`);
              }
            }
          } catch (aiError) {
            console.error(`[CronService] AI analysis failed for ${candidate.name}:`, aiError.message);
          }
        }
      }

      const duration = Date.now() - startTime;
      const message = `Matched ${matched} recordings/notes, processed ${candidates.length} candidates`;
      
      await this.logCronExecution('auto_match_recordings', 'SUCCESS', duration, message);
      console.log(`[CronService] ${message} (${duration}ms)`);
      
      return { success: true, matched, duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logCronExecution('auto_match_recordings', 'ERROR', duration, 'Failed', error.message);
      console.error('[CronService] Auto-match recordings error:', error.message);
      throw error;
    }
  }

  initialize() {
    if (this.isInitialized) {
      console.log('[CronService] Already initialized');
      return;
    }

    console.log('[CronService] Initializing cron jobs...');

    this.jobs.gmailFetch = cron.schedule('*/5 * * * *', async () => {
      console.log('[CronService] Running scheduled Gmail fetch...');
      try {
        await this.triggerGmailProcessing();
      } catch (error) {
        console.error('[CronService] Scheduled Gmail fetch failed:', error.message);
      }
    }, {
      scheduled: false
    });

    this.jobs.replyCheck = cron.schedule('*/10 * * * *', async () => {
      console.log('[CronService] Running scheduled reply check...');
      try {
        await this.triggerReplyCheck();
      } catch (error) {
        console.error('[CronService] Scheduled reply check failed:', error.message);
      }
    }, {
      scheduled: false
    });

    this.jobs.healthCheck = cron.schedule('0 * * * *', async () => {
      console.log('[CronService] Running scheduled health check...');
      try {
        await this.healthCheck();
      } catch (error) {
        console.error('[CronService] Scheduled health check failed:', error.message);
      }
    }, {
      scheduled: false
    });

    this.jobs.statusTransition = cron.schedule('*/15 * * * *', async () => {
      console.log('[CronService] Running scheduled status transition check...');
      try {
        await this.checkScheduledInterviews();
      } catch (error) {
        console.error('[CronService] Scheduled status transition failed:', error.message);
      }
    }, {
      scheduled: false
    });

    this.jobs.autoMatchRecordings = cron.schedule('*/20 * * * *', async () => {
      console.log('[CronService] Running automated recording/notes matching...');
      try {
        await this.autoMatchRecordingsAndNotes();
      } catch (error) {
        console.error('[CronService] Automated recording matching failed:', error.message);
      }
    }, {
      scheduled: false
    });

    this.isInitialized = true;
    console.log('[CronService] Cron jobs initialized (not started)');
  }

  start() {
    if (!this.isInitialized) {
      this.initialize();
    }

    Object.keys(this.jobs).forEach(jobName => {
      this.jobs[jobName].start();
      this.jobsRunning[jobName] = true;
    });

    console.log('[CronService] All cron jobs started');
  }

  stop() {
    Object.keys(this.jobs).forEach(jobName => {
      this.jobs[jobName].stop();
      this.jobsRunning[jobName] = false;
    });

    console.log('[CronService] All cron jobs stopped');
  }

  getStatus() {
    return {
      gmail: { running: this.jobsRunning.gmailFetch },
      replies: { running: this.jobsRunning.replyCheck },
      health: { running: this.jobsRunning.healthCheck },
      statusTransition: { running: this.jobsRunning.statusTransition },
      autoMatchRecordings: { running: this.jobsRunning.autoMatchRecordings }
    };
  }
}

const cronService = new CronService();

module.exports = { cronService, CronService };
