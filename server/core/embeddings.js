/**
 * Semantic embedding generator for vector search.
 */

const GEMINI_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_API_KEY_2',
  'GEMINI_API_KEY_3',
  'GEMINI_API_KEY_4',
  'GEMINI_API_KEY_5',
  'GEMINI_API_KEY_6'
];

let keyIndex = 0;

/**
 * Generate 768-dimensional text embedding using Gemini embedding API.
 * Automatically rotates across available Gemini API keys on failure/rate limit.
 * 
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
export async function getEmbedding(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null;
  }

  const availableKeys = GEMINI_KEYS
    .map(envVar => process.env[envVar])
    .filter(Boolean);

  if (availableKeys.length === 0) {
    return null;
  }

  for (let attempt = 0; attempt < availableKeys.length; attempt++) {
    const activeKey = availableKeys[(keyIndex + attempt) % availableKeys.length];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${activeKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: { parts: [{ text: text.trim() }] },
          outputDimensionality: 768
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const values = data.embedding?.values;
        if (Array.isArray(values) && values.length > 0) {
          keyIndex = (keyIndex + attempt) % availableKeys.length;
          return values;
        }
      }
    } catch {
      clearTimeout(timeout);
    }
  }

  return null;
}
