/**
 * Valid role names
 */
const VALID_ROLES = [
  'AI Engineer',
  'Full Stack Developer',
  'Frontend Developer',
  'Web Developer',
  'iOS Developer',
  'Electronic Engineer',
  '3D Specialist',
  '3D Artist',
  'Backend Developer',
  'DevOps Engineer'
];

/**
 * Normalize position to match exact role names (basic string matching)
 */
function normalizePosition(position) {
  if (!position) return 'Full Stack Developer'; // Default fallback

  const positionLower = position.toLowerCase().trim();
  
  // Return null for nonsense positions - these need CV analysis
  const nonsensePatterns = [
    'to apply', 'looking for', 'seeking', 'interested in', 'want to', 
    'position', 'opportunity', 'role', 'job', 'work', 'career',
    'skills', 'experience', 'coding', 'programming', 'development'
  ];
  
  const isNonsense = nonsensePatterns.some(pattern => 
    positionLower.includes(pattern) && positionLower.length > 20
  );
  
  if (isNonsense) {
    return null; // Signal that CV analysis is needed
  }

  // Find exact match first
  for (const role of VALID_ROLES) {
    if (positionLower === role.toLowerCase()) {
      return role;
    }
  }

  // Find partial match
  for (const role of VALID_ROLES) {
    if (positionLower.includes(role.toLowerCase())) {
      return role;
    }
  }

  // Extensive fuzzy matching for all variations
  
  // AI Engineer variations
  if (positionLower.match(/\b(ai|artificial intelligence|machine learning|ml|deep learning|data scien|nlp|computer vision)\b/i)) {
    return 'AI Engineer';
  }
  
  // Full Stack Developer variations
  if (positionLower.match(/\b(full[\s-]?stack|fullstack|mern|mean|full stack)\b/i)) {
    return 'Full Stack Developer';
  }
  
  // Frontend Developer variations
  if (positionLower.match(/\b(frontend|front[\s-]?end|react|vue|angular|ui|ux|web design|javascript|js|typescript|ts|next\.?js|nuxt)\b/i)) {
    return 'Frontend Developer';
  }
  
  // Backend Developer variations
  if (positionLower.match(/\b(backend|back[\s-]?end|node|express|django|flask|spring|api|server|database|sql|nosql|mongodb|postgres)\b/i)) {
    return 'Backend Developer';
  }
  
  // iOS Developer variations
  if (positionLower.match(/\b(ios|swift|objective[\s-]?c|apple|iphone|ipad|xcode)\b/i)) {
    return 'iOS Developer';
  }
  
  // DevOps Engineer variations
  if (positionLower.match(/\b(devops|dev[\s-]?ops|cloud|aws|azure|gcp|docker|kubernetes|k8s|jenkins|ci[\s/]?cd|terraform|ansible|infrastructure)\b/i)) {
    return 'DevOps Engineer';
  }
  
  // 3D Artist variations
  if (positionLower.match(/\b(3d|three[\s-]?d|blender|maya|cinema 4d|c4d|modeling|animation|artist|designer)\b/i)) {
    return '3D Artist';
  }
  
  // Electronic Engineer variations
  if (positionLower.match(/\b(electronic|hardware|embedded|iot|circuit|pcb|firmware|microcontroller|arduino|raspberry)\b/i)) {
    return 'Electronic Engineer';
  }
  
  // Web Developer variations (catch-all for web-related)
  if (positionLower.match(/\b(web|website|html|css)\b/i)) {
    return 'Web Developer';
  }
  
  // Generic developer/engineer - default to Full Stack
  if (positionLower.match(/\b(developer|engineer|programmer|coder|software)\b/i)) {
    return 'Full Stack Developer';
  }

  // Return null if no match - needs CV analysis
  return null;
}

/**
 * Detect position from CV content using keyword analysis
 */
function detectPositionFromCV(cvContent) {
  if (!cvContent) return 'Full Stack Developer';
  
  const content = cvContent.toLowerCase();
  const scores = {};
  
  // Initialize scores
  VALID_ROLES.forEach(role => scores[role] = 0);
  
  // AI Engineer keywords
  if (content.match(/\b(machine learning|deep learning|neural network|tensorflow|pytorch|scikit|pandas|numpy|ai|artificial intelligence|nlp|computer vision|data science)\b/gi)) {
    scores['AI Engineer'] += (content.match(/\b(machine learning|deep learning|neural network|tensorflow|pytorch|scikit|pandas|numpy|ai|artificial intelligence|nlp|computer vision|data science)\b/gi) || []).length;
  }
  
  // Frontend Developer keywords
  if (content.match(/\b(react|vue|angular|javascript|typescript|html|css|sass|tailwind|next\.?js|redux|ui|ux|frontend|front-end)\b/gi)) {
    scores['Frontend Developer'] += (content.match(/\b(react|vue|angular|javascript|typescript|html|css|sass|tailwind|next\.?js|redux|ui|ux|frontend|front-end)\b/gi) || []).length;
  }
  
  // Backend Developer keywords
  if (content.match(/\b(node|express|django|flask|spring|java|python|api|rest|graphql|database|sql|mongodb|postgres|mysql|backend|back-end|server)\b/gi)) {
    scores['Backend Developer'] += (content.match(/\b(node|express|django|flask|spring|java|python|api|rest|graphql|database|sql|mongodb|postgres|mysql|backend|back-end|server)\b/gi) || []).length;
  }
  
  // Full Stack Developer keywords
  if (content.match(/\b(full[\s-]?stack|mern|mean|fullstack)\b/gi)) {
    scores['Full Stack Developer'] += (content.match(/\b(full[\s-]?stack|mern|mean|fullstack)\b/gi) || []).length * 3; // Higher weight
  }
  
  // iOS Developer keywords
  if (content.match(/\b(ios|swift|objective-c|xcode|apple|iphone|ipad|cocoa)\b/gi)) {
    scores['iOS Developer'] += (content.match(/\b(ios|swift|objective-c|xcode|apple|iphone|ipad|cocoa)\b/gi) || []).length;
  }
  
  // DevOps Engineer keywords
  if (content.match(/\b(devops|docker|kubernetes|aws|azure|gcp|jenkins|ci\/cd|terraform|ansible|cloud|infrastructure)\b/gi)) {
    scores['DevOps Engineer'] += (content.match(/\b(devops|docker|kubernetes|aws|azure|gcp|jenkins|ci\/cd|terraform|ansible|cloud|infrastructure)\b/gi) || []).length;
  }
  
  // 3D Artist keywords
  if (content.match(/\b(3d|blender|maya|cinema 4d|modeling|animation|rendering|texture)\b/gi)) {
    scores['3D Artist'] += (content.match(/\b(3d|blender|maya|cinema 4d|modeling|animation|rendering|texture)\b/gi) || []).length;
  }
  
  // Electronic Engineer keywords
  if (content.match(/\b(electronic|hardware|embedded|circuit|pcb|microcontroller|arduino|firmware|iot)\b/gi)) {
    scores['Electronic Engineer'] += (content.match(/\b(electronic|hardware|embedded|circuit|pcb|microcontroller|arduino|firmware|iot)\b/gi) || []).length;
  }
  
  // Find role with highest score
  let maxScore = 0;
  let detectedRole = 'Full Stack Developer';
  
  for (const [role, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedRole = role;
    }
  }
  
  // If both frontend and backend have high scores, it's Full Stack
  if (scores['Frontend Developer'] > 3 && scores['Backend Developer'] > 3) {
    return 'Full Stack Developer';
  }
  
  return detectedRole;
}

module.exports = { normalizePosition, detectPositionFromCV, VALID_ROLES };
