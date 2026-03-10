-- Revert Anas Irfan's status back to INBOX so assessment can be sent again
UPDATE candidates 
SET 
  status = 'INBOX',
  round_stage = 'INBOX',
  assessment_given = 0,
  assessment_link = NULL
WHERE email = 'anasirfan101010@gmail.com';

-- Verify the update
SELECT id, name, email, status, round_stage, assessment_given, assessment_link 
FROM candidates 
WHERE email = 'anasirfan101010@gmail.com';
