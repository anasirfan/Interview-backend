const express = require('express');
const {
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
} = require('../controllers/candidate.controller');
const { authenticate, authorize } = require('../middlewares/auth');
const { uploadCV } = require('../middlewares/upload');
const multer = require('multer');
const path = require('path');

const assessmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/assessments/');
  },
  filename: (req, file, cb) => {
    const hash = require('crypto').createHash('md5').update(Date.now() + file.originalname).digest('hex');
    const ext = path.extname(file.originalname);
    cb(null, hash + ext);
  }
});

const assessmentUpload = multer({ storage: assessmentStorage });

const router = express.Router();

router.use(authenticate);

router.get('/metrics', getMetrics);
router.get('/export', exportCsv);
router.get('/scheduled', async (req, res) => {
  try {
    const { query } = require('../database/db');
    const { sendSuccess, sendError } = require('../utils/apiResponse');
    
    const scheduledCandidates = await query(`
      SELECT id, name, email, phone, position, interview_date, meet_link, round_stage, cv_path, interviewer
      FROM candidates 
      WHERE status = 'SCHEDULED' 
        AND interview_date IS NOT NULL 
        AND is_archived = 0
      ORDER BY interview_date ASC
    `);
    
    sendSuccess(res, 'Scheduled interviews retrieved', scheduledCandidates);
  } catch (error) {
    const { sendError } = require('../utils/apiResponse');
    sendError(res, error.message || 'Failed to retrieve scheduled interviews', 500);
  }
});
router.get('/', getCandidates);
router.get('/:id', getCandidateById);

router.post('/', authorize('SUPER_ADMIN', 'HR_ADMIN'), uploadCV.single('cv'), createCandidate);
router.post('/bulk-upload', authorize('SUPER_ADMIN', 'HR_ADMIN'), uploadCV.single('cv'), bulkUploadCV);
router.post('/:id/generate-assessment-email', authorize('SUPER_ADMIN', 'HR_ADMIN'), generateAssessmentEmail);
router.post('/:id/send-assessment', authorize('SUPER_ADMIN', 'HR_ADMIN'), assessmentUpload.single('attachment'), sendAssessmentEmail);
router.post('/:id/revert-assessment', authorize('SUPER_ADMIN', 'HR_ADMIN'), revertAssessmentStatus);
router.post('/:id/send-meeting-invite', authorize('SUPER_ADMIN', 'HR_ADMIN'), sendMeetingInvite);
router.post('/:id/reschedule', authorize('SUPER_ADMIN', 'HR_ADMIN'), rescheduleInterview);
router.put('/:id', authorize('SUPER_ADMIN', 'HR_ADMIN'), uploadCV.single('cv'), updateCandidate);
router.patch('/:id/status', authorize('SUPER_ADMIN', 'HR_ADMIN'), updateCandidateStatus);
router.patch('/:id/shortlist', authorize('SUPER_ADMIN', 'HR_ADMIN'), shortlistCandidate);
router.patch('/:id/archive', authorize('SUPER_ADMIN', 'HR_ADMIN'), archiveCandidate);
router.delete('/:id', authorize('SUPER_ADMIN'), deleteCandidate);

module.exports = router;
