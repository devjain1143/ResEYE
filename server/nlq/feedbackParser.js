import { validateIntent } from './intentSchema.js';

const BRANCH_MAP = [
  { keys: ['cseds', 'ds', 'datascience'], spec: 'Data Science' },
  { keys: ['cseai', 'ai', 'artificialintelligence'], spec: 'Artificial Intelligence' },
  { keys: ['csecps', 'cps', 'cyberphysical', 'cyberphysicalsystem'], spec: 'Cyber Physical System' },
  { keys: ['csecyber', 'cyber', 'cybersecurity'], spec: 'Cyber Security' },
  { keys: ['csecs', 'cse', 'cs', 'computerscience'], spec: 'Computer Science & Engineering' },
  { keys: ['ece', 'electronics', 'electronicscommunication'], spec: 'Electronics & Communication Engineering' },
  { keys: ['it', 'informationtechnology'], spec: 'Information Technology' },
  { keys: ['mnc', 'mac', 'mathematicsandcomputing', 'mathematicscomputing'], spec: 'Mathematics and Computing' },
  { keys: ['pnc', 'pce', 'physicsandcomputationalengineering', 'physicscomputational'], spec: 'Physics and Computational Engineering' },
  { keys: ['mca', 'masterofcomputerapplication'], spec: 'Master of Computer Application' }
];

function extractBranchAndBatch(text) {
  const clean = text.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  let foundSpec = null;
  let foundBatch = null;

  const batchMatch = text.match(/\b(20\d{2}|\d{2})\b/);
  if (batchMatch) {
    foundBatch = batchMatch[1];
  }

  const tokens = clean.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    for (const b of BRANCH_MAP) {
      if (b.keys.includes(token)) {
        foundSpec = b.spec;
        break;
      }
    }
    if (foundSpec) break;
  }

  return { specialization: foundSpec, batch: foundBatch };
}

function parseShorthand(input) {
  const lower = input.toLowerCase();

  // 1. Topper
  if (lower.startsWith('topper') || lower.startsWith('top')) {
    const { specialization, batch } = extractBranchAndBatch(lower);
    const semMatch = lower.match(/\bsem(?:ester)?\s*(\d)\b/);
    const semester = semMatch ? parseInt(semMatch[1], 10) : undefined;
    const metric = lower.includes('spi') ? 'spi' : 'cpi';

    return {
      intent: 'TOP_SCORER',
      params: {
        ...(specialization && { specialization }),
        ...(batch && { batch }),
        metric,
        ...(semester && { semester })
      },
      confidence: 'high'
    };
  }

  // 2. Average
  if (lower.startsWith('avg') || lower.startsWith('average')) {
    const { specialization, batch } = extractBranchAndBatch(lower);
    const semMatch = lower.match(/\bsem(?:ester)?\s*(\d)\b/);
    const semester = semMatch ? parseInt(semMatch[1], 10) : undefined;
    const metric = lower.includes('spi') ? 'spi' : 'cpi';

    return {
      intent: 'AVERAGE_METRIC',
      params: {
        ...(specialization && { specialization }),
        ...(batch && { batch }),
        metric,
        ...(semester && { semester })
      },
      confidence: 'high'
    };
  }

  // 3. Result count
  if (lower.startsWith('result') || lower.startsWith('pass') || lower.startsWith('fail')) {
    const { specialization, batch } = extractBranchAndBatch(lower);
    const semMatch = lower.match(/\bsem(?:ester)?\s*(\d)\b/);
    const semester = semMatch ? parseInt(semMatch[1], 10) : 1;

    return {
      intent: 'RESULT_COUNT',
      params: {
        ...(specialization && { specialization }),
        ...(batch && { batch }),
        semester
      },
      confidence: 'high'
    };
  }

  // 4. Batch roster
  if (lower.startsWith('roster') || lower.startsWith('list')) {
    const { specialization, batch } = extractBranchAndBatch(lower);
    return {
      intent: 'BATCH_ROSTER',
      params: {
        ...(specialization && { specialization }),
        ...(batch && { batch })
      },
      confidence: 'high'
    };
  }

  return null;
}

export async function parseCorrectionInput(input) {
  if (!input || typeof input !== 'string') {
    return { success: false, error: 'Input cannot be empty.' };
  }

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // 1. Keyword check for UNSUPPORTED
  if (
    lower === 'unsupported' ||
    lower === 'out of scope' ||
    lower === 'reject' ||
    lower === 'invalid' ||
    lower === 'off topic' ||
    lower === 'none'
  ) {
    const intentObj = { intent: 'UNSUPPORTED', params: {}, confidence: 'high' };
    return { success: true, intentJson: JSON.stringify(intentObj, null, 2), intentObj };
  }

  // 2. Direct JSON parsing
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed.confidence) parsed.confidence = 'high';
      const val = validateIntent(parsed);
      if (val.valid) {
        return { success: true, intentJson: JSON.stringify(val.data, null, 2), intentObj: val.data };
      }
      return { success: false, error: `Invalid schema: ${val.error}` };
    } catch (err) {
      return { success: false, error: `Malformed JSON: ${err.message}` };
    }
  }

  // 3. Shorthand syntax parsing
  const shorthandResult = parseShorthand(trimmed);
  if (shorthandResult) {
    const val = validateIntent(shorthandResult);
    if (val.valid) {
      return { success: true, intentJson: JSON.stringify(val.data, null, 2), intentObj: val.data };
    }
  }

  // 4. Natural language parsing via routeToIntent
  try {
    const { routeToIntent } = await import('./providerRouter.js');
    const { rawIntent } = await routeToIntent(trimmed);
    const val = validateIntent(rawIntent);
    if (val.valid) {
      return { success: true, intentJson: JSON.stringify(val.data, null, 2), intentObj: val.data };
    }
    return { success: false, error: `Model generated invalid intent: ${val.error}` };
  } catch (err) {
    return { success: false, error: `Failed to interpret correction: ${err.message}` };
  }
}
