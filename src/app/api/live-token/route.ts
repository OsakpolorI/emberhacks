import { apiError, gemini, localRequest } from '@/lib/server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!localRequest(request))
    return Response.json({ error: 'Origin not allowed' }, { status: 403 });
  try {
    const model = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
    const token = await gemini().authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 600000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60000).toISOString(),
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });
    return Response.json(
      { token: token.name, model },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return apiError(error);
  }
}
