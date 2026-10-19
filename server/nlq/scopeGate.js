export const ACADEMIC_KEYWORDS = [
  'sem', 'semester', 'cpi', 'spi', 'cgpa', 'gpa',
  'batch', 'topper', 'top', 'rank', 'average', 'avg',
  'pass', 'passed', 'fail', 'failed', 'result', 'results',
  'roster', 'list', 'student', 'students', 'branch',
  'ece', 'cse', 'it', 'ai', 'mca', 'btech', 'degree',
  'scholar', 'specialization', 'highest', 'lowest', 'score'
];

export const INJECTION_PATTERNS = [
  /\bignore\s+(?:all\s+|any\s+|prior\s+|previous\s+|above\s+|the\s+|your\s+)*(?:system\s+)?(?:instructions?|prompts?|rules?|guidelines?|directives?)\b/i,
  /\bdisregard\s+(?:all\s+|any\s+|prior\s+|previous\s+|above\s+|the\s+|your\s+)*(?:system\s+)?(?:instructions?|prompts?|rules?|guidelines?|directives?)\b/i,
  /\bforget\s+(?:that\s+)?(?:you\s+are|you're|everything|your\s+(?:instructions?|role|identity|purpose))\b/i,
  /\bact\s+as\s+(?:an?\s+)?(?:unrestricted|jailbroken|unfiltered|uncensored|dan|developer\s+mode)(?:\s+ai|\s+model|\s+bot)?\b/i,
  /\b(?:reveal|show|display|print|output|repeat|share|give\s+me)\s+(?:all\s+|any\s+|the\s+|your\s+|raw\s+|initial\s+|full\s+|original\s+)*(?:system\s+)?(?:prompts?|instructions?|rules?|guidelines?)\b/i,
  /\b(?:system\s+prompt|system\s+instructions?)\b/i,
  /\bwhat\s+(?:is|are)\s+(?:the\s+|your\s+)*(?:system\s+)?(?:prompts?|instructions?)\b/i,
  /\b(?:you\s+are|you're)\s+now\s+(?:a|an|the)\b/i,
  /\[system\]:?/i,
  /\[(?:assistant|user)\]:?/i
];

export function checkScope(text) {
  if (!text || typeof text !== 'string') {
    return { inScope: false, reason: 'Empty query' };
  }

  if (text.length > 1000) {
    return { inScope: false, reason: 'Query exceeds maximum length of 1000 characters' };
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        inScope: false,
        reason: 'injection_marker',
        code: 'injection_marker'
      };
    }
  }

  const normalized = text.toLowerCase().trim();

  if (/\b\d{2}[a-z]\d{2,6}\b/i.test(normalized)) {
    return { inScope: true };
  }

  for (const keyword of ACADEMIC_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(normalized)) {
      return { inScope: true };
    }
  }

  return {
    inScope: false,
    reason: 'Query does not appear to relate to student academic records.'
  };
}
