/**
 * Valid role names
 */
const VALID_ROLES = [
  'AI Engineer',
  'Full Stack Developer',
  'Frontend Developer',
  'Web Developer',
  'iOS Developer',
  'Electrical Engineer',
  'Electronics Engineer',
  'Embedded Systems Engineer',
  '3D Designer',
  '3D Specialist',
  '3D Artist',
  'Backend Developer',
  'DevOps Engineer'
];

const AI_STRONG_REGEX = /\b(artificial intelligence|machine learning|deep learning|data science|nlp|computer vision|llm|large language model|generative ai|genai|tensorflow|pytorch|scikit(?:-|\s)?learn|langchain)\b/gi;
const AI_WEAK_REGEX = /\b(ai|ml)\b/gi;
const EMBEDDED_REGEX = /\b(embedded(?: systems?)?|firmware|microcontroller(?:s)?|arduino|raspberry pi|esp32|esp8266|stm32|avr|fpga|verilog|vhdl|rtos|bare metal|embedded c|keil|xilinx|vivado)\b/gi;
const ELECTRONICS_REGEX = /\b(electronic(?:s)?|hardware|pcb|circuit(?:s)?|sensor(?:s)?|iot|vlsi|multisim|proteus|cadence|labview|signal(?:s)?|antenna|microwave)\b/gi;
const ELECTRICAL_REGEX = /\b(electrical|power electronics|power system(?:s)?|control system(?:s)?|buck converter|motor(?:s)?|renewable|transmission|distribution|substation|rf)\b/gi;
const THREE_D_DESIGNER_REGEX = /\b(3d designer|3d design|product design|industrial design|mechanical design|solidworks|cad|3d printing|prototyping|prototype design)\b/gi;
const THREE_D_ARTIST_REGEX = /\b(3d artist|blender|maya|cinema 4d|c4d|rendering|texture|texturing|animation|character design|environment art)\b/gi;

const ROLE_ALIASES = [
  { regex: /\bembedded(?: systems?)? engineer\b/i, role: 'Embedded Systems Engineer' },
  { regex: /\belectronics engineer\b/i, role: 'Electronics Engineer' },
  { regex: /\belectronic engineer\b/i, role: 'Electronics Engineer' },
  { regex: /\belectrical engineer\b/i, role: 'Electrical Engineer' },
  { regex: /\b3d designer\b/i, role: '3D Designer' },
  { regex: /\b3d artist\b/i, role: '3D Artist' }
];

function countMatches(text, regex) {
  if (!text) return 0;
  const matches = text.match(new RegExp(regex.source, regex.flags));
  return matches ? matches.length : 0;
}

function analyzePositionSignals(text) {
  const normalizedText = String(text || '').toLowerCase();

  const aiStrong = countMatches(normalizedText, AI_STRONG_REGEX);
  const aiWeak = countMatches(normalizedText, AI_WEAK_REGEX);
  const embedded = countMatches(normalizedText, EMBEDDED_REGEX);
  const electronics = countMatches(normalizedText, ELECTRONICS_REGEX);
  const electrical = countMatches(normalizedText, ELECTRICAL_REGEX);
  const threeDDesigner = countMatches(normalizedText, THREE_D_DESIGNER_REGEX);
  const threeDArtist = countMatches(normalizedText, THREE_D_ARTIST_REGEX);

  return {
    aiStrong,
    aiWeak,
    ai: aiStrong * 2 + aiWeak,
    embedded,
    electronics,
    electrical,
    threeDDesigner,
    threeDArtist
  };
}

function detectHardwareRole(signals) {
  const hardwareScores = {
    'Embedded Systems Engineer': signals.embedded * 4 + signals.electronics + Math.min(signals.electrical, 1),
    'Electronics Engineer': signals.electronics * 3 + Math.min(signals.embedded, 1) + Math.min(signals.electrical, 1),
    'Electrical Engineer': signals.electrical * 3 + Math.min(signals.electronics, 2)
  };

  let bestRole = null;
  let bestScore = 0;
  for (const [role, score] of Object.entries(hardwareScores)) {
    if (score > bestScore) {
      bestRole = role;
      bestScore = score;
    }
  }

  return { role: bestRole, score: bestScore };
}

function normalizePosition(position) {
  if (!position) return 'Full Stack Developer';

  const positionLower = position.toLowerCase().trim();
  const signals = analyzePositionSignals(positionLower);
  const nonsensePatterns = [
    'to apply', 'looking for', 'seeking', 'interested in', 'want to',
    'position', 'opportunity', 'role', 'job', 'work', 'career',
    'skills', 'experience', 'coding', 'programming', 'development'
  ];

  const isNonsense = nonsensePatterns.some(pattern =>
    positionLower.includes(pattern) && positionLower.length > 20
  );

  const hasKnownSignals =
    signals.ai > 0 ||
    signals.embedded > 0 ||
    signals.electronics > 0 ||
    signals.electrical > 0 ||
    signals.threeDDesigner > 0 ||
    signals.threeDArtist > 0;

  if (isNonsense && !hasKnownSignals) {
    return null;
  }

  for (const role of VALID_ROLES) {
    if (positionLower === role.toLowerCase()) {
      return role;
    }
  }

  for (const alias of ROLE_ALIASES) {
    if (positionLower.match(alias.regex)) {
      return alias.role;
    }
  }

  for (const role of VALID_ROLES) {
    if (positionLower.includes(role.toLowerCase())) {
      return role;
    }
  }

  const hardwareRole = detectHardwareRole(signals);

  if (hardwareRole.role && hardwareRole.score > 0 && hardwareRole.score >= signals.ai) {
    return hardwareRole.role;
  }

  if (signals.aiStrong > 0 || (signals.aiWeak > 0 && hardwareRole.score === 0)) {
    return 'AI Engineer';
  }

  if (positionLower.match(/\b(full[\s-]?stack|fullstack|mern|mean|full stack)\b/i)) {
    return 'Full Stack Developer';
  }

  if (positionLower.match(/\b(frontend|front[\s-]?end|react|vue|angular|ui|ux|web design|javascript|js|typescript|ts|next\.?js|nuxt)\b/i)) {
    return 'Frontend Developer';
  }

  if (positionLower.match(/\b(backend|back[\s-]?end|node|express|django|flask|spring|api|server|database|sql|nosql|mongodb|postgres)\b/i)) {
    return 'Backend Developer';
  }

  if (positionLower.match(/\b(ios|swift|objective[\s-]?c|apple|iphone|ipad|xcode)\b/i)) {
    return 'iOS Developer';
  }

  if (positionLower.match(/\b(devops|dev[\s-]?ops|cloud|aws|azure|gcp|docker|kubernetes|k8s|jenkins|ci[\s/]?cd|terraform|ansible|infrastructure)\b/i)) {
    return 'DevOps Engineer';
  }

  if (signals.threeDDesigner > 0 || (positionLower.match(/\b(3d|three[\s-]?d)\b/i) && positionLower.match(/\b(designer|design|solidworks|cad|prototype|printing)\b/i))) {
    return '3D Designer';
  }

  if (signals.threeDArtist > 0 || positionLower.match(/\b(3d|three[\s-]?d|blender|maya|cinema 4d|c4d|rendering|texture|animation|artist)\b/i)) {
    return '3D Artist';
  }

  if (hardwareRole.role && hardwareRole.score > 0) {
    return hardwareRole.role;
  }

  if (positionLower.match(/\b(web|website|html|css)\b/i)) {
    return 'Web Developer';
  }

  if (positionLower.match(/\b(developer|engineer|programmer|coder|software)\b/i)) {
    return 'Full Stack Developer';
  }

  return null;
}

function detectPositionFromCV(cvContent) {
  if (!cvContent) return 'Full Stack Developer';

  const content = cvContent.toLowerCase();
  const scores = {};
  const signals = analyzePositionSignals(content);

  VALID_ROLES.forEach(role => {
    scores[role] = 0;
  });

  scores['AI Engineer'] += signals.aiStrong * 2 + signals.aiWeak;
  if (content.match(/\b(neural network|pandas|numpy)\b/gi)) {
    scores['AI Engineer'] += (content.match(/\b(neural network|pandas|numpy)\b/gi) || []).length;
  }

  if (content.match(/\b(react|vue|angular|javascript|typescript|html|css|sass|tailwind|next\.?js|redux|ui|ux|frontend|front-end)\b/gi)) {
    scores['Frontend Developer'] += (content.match(/\b(react|vue|angular|javascript|typescript|html|css|sass|tailwind|next\.?js|redux|ui|ux|frontend|front-end)\b/gi) || []).length;
  }

  if (content.match(/\b(node|express|django|flask|spring|java|python|api|rest|graphql|database|sql|mongodb|postgres|mysql|backend|back-end|server)\b/gi)) {
    scores['Backend Developer'] += (content.match(/\b(node|express|django|flask|spring|java|python|api|rest|graphql|database|sql|mongodb|postgres|mysql|backend|back-end|server)\b/gi) || []).length;
  }

  if (content.match(/\b(full[\s-]?stack|mern|mean|fullstack)\b/gi)) {
    scores['Full Stack Developer'] += (content.match(/\b(full[\s-]?stack|mern|mean|fullstack)\b/gi) || []).length * 3;
  }

  if (content.match(/\b(ios|swift|objective-c|xcode|apple|iphone|ipad|cocoa)\b/gi)) {
    scores['iOS Developer'] += (content.match(/\b(ios|swift|objective-c|xcode|apple|iphone|ipad|cocoa)\b/gi) || []).length;
  }

  if (content.match(/\b(devops|docker|kubernetes|aws|azure|gcp|jenkins|ci\/cd|terraform|ansible|cloud|infrastructure)\b/gi)) {
    scores['DevOps Engineer'] += (content.match(/\b(devops|docker|kubernetes|aws|azure|gcp|jenkins|ci\/cd|terraform|ansible|cloud|infrastructure)\b/gi) || []).length;
  }

  scores['3D Designer'] += signals.threeDDesigner * 3;
  if (content.match(/\b(3d|three[\s-]?d|designer|design|solidworks|cad|prototyping|3d printing)\b/gi)) {
    scores['3D Designer'] += (content.match(/\b(3d|three[\s-]?d|designer|design|solidworks|cad|prototyping|3d printing)\b/gi) || []).length;
  }

  scores['3D Artist'] += signals.threeDArtist * 3;
  if (content.match(/\b(3d|blender|maya|cinema 4d|modeling|animation|rendering|texture)\b/gi)) {
    scores['3D Artist'] += (content.match(/\b(3d|blender|maya|cinema 4d|modeling|animation|rendering|texture)\b/gi) || []).length;
  }

  scores['Embedded Systems Engineer'] += signals.embedded * 3 + signals.electronics;
  scores['Electronics Engineer'] += signals.electronics * 3 + Math.min(signals.embedded, 2);
  scores['Electrical Engineer'] += signals.electrical * 3 + Math.min(signals.electronics, 2);

  let maxScore = 0;
  let detectedRole = 'Full Stack Developer';

  for (const [role, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedRole = role;
    }
  }

  if (scores['Frontend Developer'] > 3 && scores['Backend Developer'] > 3) {
    return 'Full Stack Developer';
  }

  const hardwareRole = detectHardwareRole(signals);
  if (hardwareRole.role && hardwareRole.score >= 3 && hardwareRole.score >= scores['AI Engineer']) {
    return hardwareRole.role;
  }

  return detectedRole;
}

module.exports = {
  normalizePosition,
  detectPositionFromCV,
  analyzePositionSignals,
  detectHardwareRole,
  VALID_ROLES
};
