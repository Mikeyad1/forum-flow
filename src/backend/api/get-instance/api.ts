import { auth } from '@wix/essentials';

export async function GET(req: Request) {
  try {
    const tokenInfo = await auth.getTokenInfo();
    const instanceId = tokenInfo.instanceId;
    return Response.json({ instanceId });
  } catch (error) {
    console.error('Error decoding token:', error);
    return new Response(JSON.stringify({ error: 'Failed to get instance' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
