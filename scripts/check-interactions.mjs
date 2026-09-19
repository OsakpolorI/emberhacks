import { GoogleGenAI } from '@google/genai';
process.loadEnvFile('.env.local');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
try {
  const result = await ai.interactions.create(
    {
      model: process.env.GEMINI_ANALYSIS_MODEL,
      input: 'Return ready: true as JSON.',
      store: false,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: { type: 'object', properties: { ready: { type: 'boolean' } }, required: ['ready'] },
      },
    },
    { timeout: 15000, maxRetries: 0 },
  );
  console.log(JSON.stringify({ status: result.status, text: result.output_text }));
} catch (error) {
  console.error(String(error.message).replace(/AIza[\w-]+/g, '[REDACTED]'));
  process.exitCode = 1;
}
