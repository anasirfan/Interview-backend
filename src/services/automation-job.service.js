const { get, query, run } = require('../database/db');
const { generateUUID } = require('../utils/uuid');
const automationService = require('./assessment-automation.service');
const automationStreamService = require('./automation-stream.service');

class AutomationJobService {
  constructor() {
    this.runningJobs = new Set();
  }

  async createPreviewJob(candidateIds, createdBy = null) {
    return this.createJob('preview', candidateIds, createdBy, null);
  }

  async createSendJob(candidateIds, createdBy = null, sourceJobId = null) {
    return this.createJob('send', candidateIds, createdBy, sourceJobId);
  }

  async createJob(mode, candidateIds, createdBy = null, sourceJobId = null) {
    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      throw new Error('candidateIds array is required');
    }

    const uniqueIds = [...new Set(candidateIds.map(String))];
    const jobId = generateUUID();
    const candidates = await query(
      `SELECT id, name
       FROM candidates
       WHERE id IN (${uniqueIds.map(() => '?').join(',')})`,
      uniqueIds
    );

    if (candidates.length !== uniqueIds.length) {
      const existingIds = new Set(candidates.map(candidate => String(candidate.id)));
      const missingIds = uniqueIds.filter(id => !existingIds.has(String(id)));
      const error = new Error(`Candidates not found: ${missingIds.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const byId = new Map(candidates.map(candidate => [String(candidate.id), candidate]));
    const sourceItems = sourceJobId ? await this.getSourceItemsByCandidate(sourceJobId) : new Map();

    await run(
      `INSERT INTO automation_jobs (
         id, mode, status, created_by, source_job_id, total_items, processed_items,
         successful_items, failed_items, skipped_items, created_at, updated_at
       ) VALUES (?, ?, 'pending', ?, ?, ?, 0, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [jobId, mode, createdBy, sourceJobId, uniqueIds.length]
    );

    for (let index = 0; index < uniqueIds.length; index += 1) {
      const candidate = byId.get(uniqueIds[index]);
      await run(
        `INSERT INTO automation_job_items (
           id, job_id, candidate_id, candidate_name, mode, status, sequence_no,
           source_job_item_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          generateUUID(),
          jobId,
          uniqueIds[index],
          candidate?.name || null,
          mode,
          index + 1,
          sourceItems.get(uniqueIds[index])?.id || null
        ]
      );
    }

    setImmediate(() => {
      this.processJob(jobId).catch(error => {
        console.error('[AutomationJobService] Job failed:', error.message);
      });
    });

    return this.getJob(jobId);
  }

  async getSourceItemsByCandidate(jobId) {
    const rows = await query(
      `SELECT id, candidate_id, pdf_file_name, email_data
       FROM automation_job_items
       WHERE job_id = ?
       ORDER BY sequence_no ASC`,
      [jobId]
    );

    const map = new Map();
    for (const row of rows) {
      map.set(String(row.candidate_id), row);
    }
    return map;
  }

  async processJob(jobId) {
    if (this.runningJobs.has(jobId)) {
      return;
    }
    this.runningJobs.add(jobId);

    try {
      await run(
        `UPDATE automation_jobs
         SET status = 'running', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [jobId]
      );

      automationStreamService.publish(jobId, 'job.updated', await this.getJob(jobId));

      const job = await this.getJob(jobId);
      const items = await this.getJobItems(jobId);

      for (const item of items) {
        await run(
          `UPDATE automation_job_items
           SET status = 'running', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [item.id]
        );

        automationStreamService.publish(jobId, 'item.updated', await this.getJobItem(item.id));

        try {
          const result = await this.processItem(job, item);
          await run(
            `UPDATE automation_job_items
             SET status = ?, pdf_file_name = ?, assessment_data = ?, email_data = ?,
                 error_message = NULL, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
              result.status || (job.mode === 'send' ? 'sent' : 'generated'),
              result.pdfFileName || null,
              result.assessmentData ? JSON.stringify(result.assessmentData) : null,
              result.emailData ? JSON.stringify(result.emailData) : null,
              item.id
            ]
          );
        } catch (error) {
          await run(
            `UPDATE automation_job_items
             SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [error.message, item.id]
          );
        }

        await this.refreshJobCounts(jobId);
        automationStreamService.publish(jobId, 'job.updated', await this.getJob(jobId));
        automationStreamService.publish(jobId, 'item.updated', await this.getJobItem(item.id));
      }

      const finalJob = await this.refreshJobCounts(jobId);
      const finalStatus = finalJob.failed_items > 0 && finalJob.successful_items === 0
        ? 'failed'
        : (finalJob.failed_items > 0 ? 'completed_with_errors' : 'completed');

      await run(
        `UPDATE automation_jobs
         SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [finalStatus, jobId]
      );

      automationStreamService.publish(jobId, 'job.completed', await this.getJob(jobId));
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  async processItem(job, item) {
    if (job.mode === 'preview') {
      return automationService.processCandidateAssessment(item.candidate_id, 'preview');
    }

    const sourceItem = item.source_job_item_id
      ? await get('SELECT * FROM automation_job_items WHERE id = ?', [item.source_job_item_id])
      : null;

    if (sourceItem?.pdf_file_name && sourceItem?.email_data) {
      const parsedEmail = JSON.parse(sourceItem.email_data);
      await automationService.sendExistingAssessmentEmail(item.candidate_id, sourceItem.pdf_file_name, parsedEmail);
      return {
        status: 'sent',
        pdfFileName: sourceItem.pdf_file_name,
        emailData: parsedEmail
      };
    }

    return automationService.processCandidateAssessment(item.candidate_id, 'send');
  }

  async refreshJobCounts(jobId) {
    const counts = await query(
      `SELECT status, COUNT(*) AS count
       FROM automation_job_items
       WHERE job_id = ?
       GROUP BY status`,
      [jobId]
    );

    const summary = {
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0
    };

    for (const row of counts) {
      const count = Number(row.count || 0);
      if (['generated', 'sent', 'completed'].includes(row.status)) {
        summary.processed += count;
        summary.successful += count;
      } else if (row.status === 'failed') {
        summary.processed += count;
        summary.failed += count;
      } else if (row.status === 'skipped') {
        summary.processed += count;
        summary.skipped += count;
      }
    }

    await run(
      `UPDATE automation_jobs
       SET processed_items = ?, successful_items = ?, failed_items = ?, skipped_items = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [summary.processed, summary.successful, summary.failed, summary.skipped, jobId]
    );

    return this.getJob(jobId);
  }

  async listJobs(limit = 25) {
    return query(
      `SELECT *
       FROM automation_jobs
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
      [limit]
    );
  }

  async getJob(jobId) {
    return get('SELECT * FROM automation_jobs WHERE id = ?', [jobId]);
  }

  async getJobItems(jobId) {
    return query(
      `SELECT *
       FROM automation_job_items
       WHERE job_id = ?
       ORDER BY sequence_no ASC, created_at ASC`,
      [jobId]
    );
  }

  async getJobItem(itemId) {
    return get('SELECT * FROM automation_job_items WHERE id = ?', [itemId]);
  }
}

module.exports = new AutomationJobService();
