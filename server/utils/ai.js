const AI_MODEL = process.env.AI_MODEL || 'qwen/qwen3-coder';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

async function chatCompletion(messages, options = {}) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model || AI_MODEL,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

module.exports = { chatCompletion };
