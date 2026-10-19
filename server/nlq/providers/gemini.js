import { SYSTEM_PROMPT, CONVERSATIONAL_PROMPT } from '../systemPrompt.js';
import { formatResponse } from '../responseFormatter.js';

export async function translateToIntent(question, providerConfig, customSystemPrompt = null) {
  const apiKey = process.env[providerConfig.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing API key in environment variable: ${providerConfig.apiKeyEnv}`);
  }

  const model = providerConfig.model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: customSystemPrompt || SYSTEM_PROMPT }]
    },
    contents: [
      {
        parts: [{ text: question }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Gemini provider ${providerConfig.name} timed out after 15s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const status = response.status;
    const errText = await response.text().catch(() => '');
    if (status === 429) {
      const quotaErr = new Error(`Rate limit exceeded for provider ${providerConfig.name}`);
      quotaErr.isRateLimit = true;
      throw quotaErr;
    }
    throw new Error(`Gemini provider ${providerConfig.name} failed with status ${status}: ${errText}`);
  }

  const json = await response.json();
  const rawContent = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!rawContent) {
    throw new Error(`Empty response from Gemini provider ${providerConfig.name}`);
  }

  try {
    return JSON.parse(rawContent);
  } catch {
    const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned);
  }
}

export async function generateConversationalResponse(intent, dataResult, providerConfig) {
  const apiKey = process.env[providerConfig.apiKeyEnv];
  if (!apiKey) throw new Error(`Missing API key in environment variable: ${providerConfig.apiKeyEnv}`);

  const model = providerConfig.model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let dataStr;
  if (typeof dataResult === 'object' && dataResult !== null) {
    try {
      const formatted = formatResponse(dataResult);
      dataStr = `${formatted.text}\n\nRaw Data:\n${JSON.stringify(dataResult, null, 2)}`;
    } catch {
      dataStr = JSON.stringify(dataResult, null, 2);
    }
  } else {
    dataStr = String(dataResult);
  }

  const body = {
    system_instruction: {
      parts: [{ text: CONVERSATIONAL_PROMPT }]
    },
    contents: [
      {
        parts: [
          {
            text: `Intent: ${JSON.stringify(intent)}\nData:\n${dataStr}\nSynthesize a clear, direct academic report without any emojis.`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Gemini conversational generation timed out after 15s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const status = response.status;
    const errText = await response.text().catch(() => '');
    if (status === 429) {
      const quotaErr = new Error(`Rate limit exceeded for provider ${providerConfig.name}`);
      quotaErr.isRateLimit = true;
      throw quotaErr;
    }
    throw new Error(`Gemini conversational response failed with status ${status}: ${errText}`);
  }

  const json = await response.json();
  const rawContent = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!rawContent) {
    throw new Error('Empty conversational response from Gemini');
  }

  return rawContent;
}
