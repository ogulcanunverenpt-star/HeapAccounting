import { HttpError } from './examService.js';

export function createAssistant({ provider = 'disabled', model, apiKey, ollamaUrl = 'http://127.0.0.1:11434', fetchImpl = fetch }) {
  if (!['disabled', 'ollama', 'gemini'].includes(provider)) throw new Error('AI_PROVIDER must be disabled, ollama or gemini');
  if (provider !== 'disabled' && (!model || !/^[a-zA-Z0-9._:-]{1,120}$/.test(model))) throw new Error('AI_MODEL is required and must be a model name');
  if (provider === 'gemini' && !apiKey) throw new Error('GEMINI_API_KEY is required for Gemini');
  const url = new URL(ollamaUrl);
  if (provider === 'ollama' && (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash)) {
    throw new Error('OLLAMA_URL must be an HTTP loopback URL');
  }
  const recent = new Map();
  return {
    provider,
    async respond(user, input) {
      if (provider === 'disabled') throw new HttpError(503, 'AI assistant is not configured');
      if (!input || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 2000) throw new HttpError(400, 'Message must contain 1–2000 characters');
      if (provider === 'gemini' && input.consent !== true) throw new HttpError(400, 'Consent is required before sending a message to Gemini');
      const history = input.history === undefined ? [] : input.history;
      if (!Array.isArray(history) || history.length > 4 || history.some(item =>
        !item || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 2000)) {
        throw new HttpError(400, 'Invalid assistant history');
      }
      const now = Date.now();
      const timestamps = (recent.get(user) || []).filter(time => time > now - 60000);
      if (timestamps.length >= 8) throw new HttpError(429, 'Too many assistant requests');
      timestamps.push(now);
      recent.delete(user);
      recent.set(user, timestamps);
      if (recent.size > 2000) recent.delete(recent.keys().next().value);
      const system = 'You are an educational accounting game assistant. Give concise explanations, note uncertainty, and do not claim to provide legal or tax advice.';
      const endpoint = provider === 'ollama'
        ? `${url.toString().replace(/\/+$/, '')}/api/chat`
        : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const body = provider === 'ollama'
        ? { model, stream: false, messages: [{ role: 'system', content: system }, ...history.map(item => ({ role: item.role, content: item.text })), { role: 'user', content: input.message.trim() }] }
        : { systemInstruction: { parts: [{ text: system }] }, contents: [...history.map(item => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.text }] })), { role: 'user', parts: [{ text: input.message.trim() }] }], generationConfig: { maxOutputTokens: 512 } };
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
          headers: { 'Content-Type': 'application/json', ...(provider === 'gemini' ? { 'x-goog-api-key': apiKey } : {}) },
          body: JSON.stringify(body),
        });
      } catch {
        throw new HttpError(503, 'AI provider is unavailable or timed out');
      }
      if (!response.ok) throw new HttpError(503, `AI provider returned HTTP ${response.status}`);
      let data;
      try { data = await response.json(); } catch { throw new HttpError(502, 'Invalid AI provider response'); }
      const text = provider === 'ollama' ? data?.message?.content : data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
      if (typeof text !== 'string' || !text.trim() || text.length > 16000) throw new HttpError(502, 'AI provider returned an invalid answer');
      return { answer: text.trim() };
    },
  };
}
