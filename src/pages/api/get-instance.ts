import { auth } from "@wix/essentials";

export async function GET({ request }: { request: Request }) {
  try {
    const tokenInfo = await auth.getTokenInfo();
    const instanceId = tokenInfo.instanceId;
    return new Response(JSON.stringify({ instanceId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
