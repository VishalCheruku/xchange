import { env } from '../../config/env.js';
import { withRetry, withTimeout } from '../../utils/resilience.js';

const parseJsonSafe = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const extractText = (payload) => {
  const choice = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(choice)) {
    return choice.map((part) => part?.text || part?.content || '').join('\n').trim();
  }
  if (typeof choice === 'string') return choice;
  return '';
};

export const hasLLM = Boolean(env.OPENAI_API_KEY);

export const requestStructuredLLM = async ({ systemPrompt, userPrompt, fallback }) => {
  if (!hasLLM) {
    return { result: fallback(), source: 'fallback_no_api_key' };
  }

  const runOnce = async () => {
    const response = await withTimeout(
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.OPENAI_MODEL,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      }),
      env.AI_TIMEOUT_MS,
      'LLM request',
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM request failed (${response.status}): ${body}`);
    }

    const payload = await response.json();
    const parsed = parseJsonSafe(extractText(payload));
    if (!parsed) throw new Error('LLM returned non-JSON output');
    return parsed;
  };

  try {
    const result = await withRetry(runOnce, { retries: env.AI_RETRIES, baseDelayMs: 250, factor: 2 });
    return { result, source: 'llm' };
  } catch (error) {
    console.error('LLM failed, using fallback:', error?.message || error);
    return { result: fallback(), source: 'fallback_after_error', error: error?.message || String(error) };
  }
};

