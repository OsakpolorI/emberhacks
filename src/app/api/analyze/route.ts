import { z } from 'zod';
import { assessmentSchema, requestSchema } from '@/lib/contracts';
import { ANALYST_PROMPT, groundAssessment, meaningful, insufficient } from '@/lib/analysis';
import { apiError, gemini, localRequest } from '@/lib/server';
export const runtime = 'nodejs';
const cooldowns = new Map<string, number>();
export async function POST(request: Request) {
  if (!localRequest(request))
    return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  const text = await request.text();
  if (text.length > 160000)
    return Response.json({ error: 'Transcript too large' }, { status: 413 });
  let input;
  try {
    input = requestSchema.parse(JSON.parse(text));
  } catch {
    return Response.json({ error: 'Invalid transcript request' }, { status: 400 });
  }
  const start = Date.now();
  if (!meaningful(input.turns, input.mode === 'live'))
    return Response.json({ ...insufficient(), sequence: input.sequence, latencyMs: 0 });
  try {
    const client = gemini();
    let model = process.env.GEMINI_ANALYSIS_MODEL || 'gemini-3.8-flash';
    const generate = async (selected: string) => {
      if ((cooldowns.get(selected) || 0) > Date.now()) throw new Error('429 Model quota cooldown');
      try {
        return await client.interactions.create(
          {
            model: selected,
            input: JSON.stringify({ mode: input.mode, transcript: input.turns }),
            system_instruction: ANALYST_PROMPT,
            store: false,
            generation_config: { thinking_level: 'low', max_output_tokens: 2000 },
            response_format: {
              type: 'text',
              mime_type: 'application/json',
              schema: z.toJSONSchema(assessmentSchema),
            },
          },
          { timeout: 12000, maxRetries: 0 },
        );
      } catch (error) {
        if (/429|RESOURCE_EXHAUSTED|rate limit/i.test(error instanceof Error ? error.message : ''))
          cooldowns.set(selected, Date.now() + 60000);
        throw error;
      }
    };
    let response;
    try {
      response = await generate(model);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const fallback = process.env.GEMINI_ANALYSIS_FALLBACK || 'gemini-3.6-flash';
      if (
        fallback === model ||
        !/429|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|timeout|timed out/i.test(
          message,
        )
      )
        throw error;
      model = fallback;
      response = await generate(model);
    }
    return Response.json({
      ...groundAssessment(
        JSON.parse(response.output_text || '{}'),
        input.turns,
        input.mode === 'live',
      ),
      sequence: input.sequence,
      latencyMs: Date.now() - start,
      model,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      console.warn(
        'Analysis schema validation:',
        error.issues.map((i) => ({ path: i.path, code: i.code, message: i.message })),
      );
    else
      console.warn(
        'Analysis provider error:',
        error instanceof Error
          ? error.message.replace(/AIza[\w-]+/g, '[REDACTED]').slice(0, 600)
          : 'unknown',
      );
    return apiError(error);
  }
}
