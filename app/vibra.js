export class VibraError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function askVibra(messages, maxCompletionTokens) {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new VibraError('Vibra todavía no está configurada.', 503);
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(14000),
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      reasoning_effort: 'low',
      max_completion_tokens: maxCompletionTokens,
      response_format: { type: 'json_object' },
      messages,
    }),
  });
  if (response.status === 429) throw new VibraError('Vibra está ocupada. Intenta de nuevo en un momento.', 429);
  if (response.status === 401 || response.status === 403) throw new VibraError('Vibra no está disponible en este momento.', 503);
  if (!response.ok) throw new Error('Vibra unavailable');
  const payload = await response.json();
  return JSON.parse(payload.choices?.[0]?.message?.content || '{}');
}
