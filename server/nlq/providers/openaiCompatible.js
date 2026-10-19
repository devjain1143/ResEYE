import { SYSTEM_PROMPT, CONVERSATIONAL_PROMPT } from '../systemPrompt.js';
import { formatResponse } from '../responseFormatter.js';

export async function translateToIntent(question, providerConfig, customSystemPrompt = null) {
  const apiKey = process.env[providerConfig.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`Missing API key in environment variable: ${providerConfig.apiKeyEnv}`);
  }

  const endpoint = providerConfig.endpoint || 'https://api.openai.com/v1/chat/completions';
  const model = providerConfig.model || 'gpt-4o-mini';

  const body = {
    model,
    messages: [
      { role: 'system', content: customSystemPrompt || SYSTEM_PROMPT },
      { role: 'user', content: question }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
    ...(providerConfig.extraBody || {})
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Provider ${providerConfig.name} timed out after 15s`);
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
    throw new Error(`Provider ${providerConfig.name} failed with status ${status}: ${errText}`);
  }

  const json = await response.json();
  const rawContent = json.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new Error(`Empty response from provider ${providerConfig.name}`);
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

  const endpoint = providerConfig.endpoint || 'https://api.openai.com/v1/chat/completions';
  const model = providerConfig.model || 'gpt-4o-mini';

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
    model,
    messages: [
      { role: 'system', content: CONVERSATIONAL_PROMPT },
      { role: 'user', content: `Intent: ${JSON.stringify(intent)}\nData:\n${dataStr}\nSynthesize a clear, direct academic report without any emojis.` }
    ],
    temperature: 0.2
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Provider ${providerConfig.name} timed out after 15s`);
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
    throw new Error(`Provider ${providerConfig.name} conversational generation failed: ${errText}`);
  }

  const json = await response.json();
  const rawContent = json.choices?.[0]?.message?.content?.trim();
  if (!rawContent) {
    throw new Error('Empty response from provider');
  }

  return rawContent;
}
