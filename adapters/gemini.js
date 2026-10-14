function createGemini({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return {
    async generate(prompt, { json = false } = {}) {
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');
      const model = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
          generationConfig: json ? { responseMimeType: 'application/json' } : {} })
      });
      if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
      if (!text) throw new Error('Gemini returned no content');
      return json ? JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) : text;
    }
  };
}
module.exports = { createGemini };
