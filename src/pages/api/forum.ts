import { auth } from "@wix/essentials";
import { members } from "@wix/members";

type CreateThreadBody = {
  action?: string;
  title?: string;
  content?: string;
  category_id?: string | number | null;
  thread_id?: string | number;
  reply_id?: string | number;
  visitor_name?: string;
  who_can_post_threads?: string;
  who_can_post_replies?: string;
};

export async function POST({ request }: { request: Request }) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "You must be logged in to post." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokenInfoResponse = await fetch("https://www.wixapis.com/oauth2/token-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: authHeader }),
    });

    if (!tokenInfoResponse.ok) {
      return new Response(JSON.stringify({ error: "You must be logged in to post." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokenInfo = (await tokenInfoResponse.json()) as {
      subjectId?: string;
      subjectType?: string;
    };
    const userId = tokenInfo.subjectId;
    const subjectType = tokenInfo.subjectType;

    if (!userId || !subjectType) {
      return new Response(JSON.stringify({ error: "You must be logged in to post." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const elevatedGetMember = auth.elevate(members.getMember);
    let userName = `User-${userId.slice(0, 8)}`;
    if (subjectType === "MEMBER" || subjectType === "USER") {
      try {
        const memberData = await elevatedGetMember(userId, { fieldsets: ["FULL"] });
        userName =
          memberData?.profile?.nickname ??
          memberData?.contact?.firstName ??
          memberData?.loginEmail?.split('@')[0] ??
          `User-${userId.slice(0, 8)}`;
      } catch {
        // keep default
      }
    }

    const body = (await request.json()) as CreateThreadBody;

    if (subjectType === "VISITOR") {
      const visitorName = body.visitor_name;
      if (visitorName && visitorName.trim()) {
        userName = visitorName.trim().slice(0, 50);
      }
    }

    const { action, title, content, category_id, thread_id, reply_id, who_can_post_threads, who_can_post_replies } = body;

    if (
      action !== "create_thread" &&
      action !== "create_reply" &&
      action !== "delete_thread" &&
      action !== "delete_reply"
    ) {
      return new Response(
        JSON.stringify({
          error:
            'Unsupported action. Use "create_thread", "create_reply", "delete_thread", or "delete_reply".',
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const appTokenInfo = await auth.getTokenInfo();
    const instanceId = appTokenInfo.instanceId;

    if (!instanceId) {
      return new Response(JSON.stringify({ error: "Missing instanceId" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = (import.meta.env.PUBLIC_SUPABASE_URL as string);
    const supabaseServiceRoleKey = (import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string);

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing server env vars" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (action === "create_thread") {
      if (who_can_post_threads === "members_only" && subjectType === "VISITOR") {
        return new Response(JSON.stringify({ error: "Members only" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!title || !content) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: title, content" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const insertPayload = {
        title,
        body: content,
        category_id: category_id ?? null,
        site_id: instanceId,
        user_id: userId,
        user_name: userName,
        author_name: userName,
      };

      const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify(insertPayload),
      });

      if (!supabaseResponse.ok) {
        const errorText = await supabaseResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to create thread in Supabase", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const created = (await supabaseResponse.json()) as unknown;
      const createdThread =
        Array.isArray(created) && created.length > 0 ? created[0] : created;

      return new Response(JSON.stringify(createdThread), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "create_reply") {
      if (who_can_post_replies === "members_only" && subjectType === "VISITOR") {
        return new Response(JSON.stringify({ error: "Members only" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { thread_id } = body;

      if (!thread_id || !content) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: thread_id, content" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const insertPayload = {
        thread_id,
        body: content,
        site_id: instanceId,
        user_id: userId,
        user_name: userName,
        author_name: userName,
      };

      const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/replies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify(insertPayload),
      });

      if (!supabaseResponse.ok) {
        const errorText = await supabaseResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to create reply in Supabase", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const created = (await supabaseResponse.json()) as unknown;
      const createdReply =
        Array.isArray(created) && created.length > 0 ? created[0] : created;

      return new Response(JSON.stringify(createdReply), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "delete_thread") {
      if (!thread_id) {
        return new Response(
          JSON.stringify({ error: "Missing required field: thread_id" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const threadResponse = await fetch(
        `${supabaseUrl}/rest/v1/threads?id=eq.${encodeURIComponent(String(thread_id))}&site_id=eq.${encodeURIComponent(instanceId)}&select=*`,
        {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      if (!threadResponse.ok) {
        const errorText = await threadResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to load thread", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const threadRows = (await threadResponse.json()) as { user_id?: string }[];
      const thread = Array.isArray(threadRows) && threadRows.length > 0 ? threadRows[0] : null;

      if (!thread) {
        return new Response(JSON.stringify({ error: "Thread not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const isOwner = subjectType === "APP";
      const isAuthor = subjectType === "MEMBER" && thread.user_id === userId;
      if (!isOwner && !isAuthor) {
        return new Response(JSON.stringify({ error: "Not allowed" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      const deleteThreadResponse = await fetch(
        `${supabaseUrl}/rest/v1/threads?id=eq.${encodeURIComponent(String(thread_id))}&site_id=eq.${encodeURIComponent(instanceId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      if (!deleteThreadResponse.ok) {
        const errorText = await deleteThreadResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to delete thread", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const deleteRepliesResponse = await fetch(
        `${supabaseUrl}/rest/v1/replies?thread_id=eq.${encodeURIComponent(String(thread_id))}&site_id=eq.${encodeURIComponent(instanceId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      if (!deleteRepliesResponse.ok) {
        const errorText = await deleteRepliesResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to delete replies", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "delete_reply") {
      if (!reply_id) {
        return new Response(
          JSON.stringify({ error: "Missing required field: reply_id" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const replyResponse = await fetch(
        `${supabaseUrl}/rest/v1/replies?id=eq.${encodeURIComponent(String(reply_id))}&site_id=eq.${encodeURIComponent(instanceId)}&select=*`,
        {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      if (!replyResponse.ok) {
        const errorText = await replyResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to load reply", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const replyRows = (await replyResponse.json()) as { user_id?: string; thread_id?: string }[];
      const reply = Array.isArray(replyRows) && replyRows.length > 0 ? replyRows[0] : null;
      const replyThreadId = reply?.thread_id ?? null;

      if (!reply) {
        return new Response(JSON.stringify({ error: "Reply not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const isOwner = subjectType === "APP";
      const isAuthor = subjectType === "MEMBER" && reply.user_id === userId;
      if (!isOwner && !isAuthor) {
        return new Response(JSON.stringify({ error: "Not allowed" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      const deleteReplyResponse = await fetch(
        `${supabaseUrl}/rest/v1/replies?id=eq.${encodeURIComponent(String(reply_id))}&site_id=eq.${encodeURIComponent(instanceId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      if (!deleteReplyResponse.ok) {
        const errorText = await deleteReplyResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to delete reply", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      if (replyThreadId) {
        const countFetch = await fetch(
          `${supabaseUrl}/rest/v1/replies?thread_id=eq.${encodeURIComponent(String(replyThreadId))}&site_id=eq.${encodeURIComponent(instanceId)}&select=id`,
          {
            headers: {
              apikey: supabaseServiceRoleKey,
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
          }
        );
        const remaining = (await countFetch.json()) as { id: string }[];
        const newCount = Array.isArray(remaining) ? remaining.length : 0;

        await fetch(
          `${supabaseUrl}/rest/v1/threads?id=eq.${encodeURIComponent(String(replyThreadId))}&site_id=eq.${encodeURIComponent(instanceId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseServiceRoleKey,
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
            body: JSON.stringify({ reply_count: newCount }),
          }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Failed to process forum request",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function GET({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    const tokenInfo = await auth.getTokenInfo();
    const instanceId = tokenInfo.instanceId;

    if (!instanceId) {
      return new Response(JSON.stringify({ error: "Missing instanceId" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = (import.meta.env.PUBLIC_SUPABASE_URL as string);
    const supabaseServiceRoleKey = (import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string);

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing server env vars" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "get_threads_with_identity") {
      const authHeader = request.headers.get("authorization");

      const [identityResult, threadsResponse] = await Promise.all([
        authHeader
          ? fetch("https://www.wixapis.com/oauth2/token-info", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: authHeader }),
            })
              .then((r) => (r.ok ? (r.json() as Promise<{ subjectId?: string; subjectType?: string }>) : null))
              .catch(() => null)
          : Promise.resolve(null),
        fetch(
          `${supabaseUrl}/rest/v1/threads?site_id=eq.${encodeURIComponent(instanceId)}&select=*&order=created_at.desc`,
          {
            headers: {
              apikey: supabaseServiceRoleKey,
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
          }
        ),
      ]);

      if (!threadsResponse.ok) {
        const errorText = await threadsResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to load threads", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const threads = await threadsResponse.json();

      return new Response(
        JSON.stringify({
          threads,
          subjectType: identityResult?.subjectType ?? null,
          userId: identityResult?.subjectId ?? null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    } else if (action === "get_threads") {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/threads?site_id=eq.${encodeURIComponent(instanceId)}&select=*&order=created_at.desc`,
        {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: "Failed to load threads", details: errorText }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      const threads = await response.json();

      return new Response(JSON.stringify(threads), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "get_identity") {
      const authHeader = request.headers.get("authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const tokenInfoResponse = await fetch("https://www.wixapis.com/oauth2/token-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authHeader }),
      });

      if (!tokenInfoResponse.ok) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const visitorTokenInfo = (await tokenInfoResponse.json()) as {
        subjectId?: string;
        subjectType?: string;
      };

      return new Response(
        JSON.stringify({
          subjectType: visitorTokenInfo.subjectType ?? null,
          userId: visitorTokenInfo.subjectId ?? null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

    } else if (action === "get_replies") {
      const threadId = url.searchParams.get("thread_id");

      if (!threadId) {
        return new Response(JSON.stringify({ error: "Missing thread_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/replies?thread_id=eq.${encodeURIComponent(threadId)}&site_id=eq.${encodeURIComponent(instanceId)}&select=*&order=created_at.asc`,
        {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return new Response(JSON.stringify({ error: "Failed to load replies", details: errorText }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "admin_delete_thread") {
      const threadId = url.searchParams.get("thread_id");
      if (!threadId) {
        return new Response(JSON.stringify({ error: "Missing thread_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const deleteThreadResponse = await fetch(
        `${supabaseUrl}/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}&site_id=eq.${encodeURIComponent(instanceId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );
      const deleteRepliesResponse = await fetch(
        `${supabaseUrl}/rest/v1/replies?thread_id=eq.${encodeURIComponent(threadId)}&site_id=eq.${encodeURIComponent(instanceId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );
      if (!deleteThreadResponse.ok) {
        return new Response(JSON.stringify({ error: "Failed to delete thread" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "admin_delete_reply") {
      const replyId = url.searchParams.get("reply_id");
      if (!replyId) {
        return new Response(JSON.stringify({ error: "Missing reply_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const replyFetch = await fetch(
        `${supabaseUrl}/rest/v1/replies?id=eq.${encodeURIComponent(replyId)}&select=thread_id`,
        {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );
      const replyRows = (await replyFetch.json()) as { thread_id?: string }[];
      const replyThreadId = replyRows?.[0]?.thread_id ?? null;

      const deleteReplyResponse = await fetch(
        `${supabaseUrl}/rest/v1/replies?id=eq.${encodeURIComponent(replyId)}&site_id=eq.${encodeURIComponent(instanceId)}`,
        {
          method: "DELETE",
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );
      if (!deleteReplyResponse.ok) {
        return new Response(JSON.stringify({ error: "Failed to delete reply" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (replyThreadId) {
        const countFetch = await fetch(
          `${supabaseUrl}/rest/v1/replies?thread_id=eq.${encodeURIComponent(replyThreadId)}&site_id=eq.${encodeURIComponent(instanceId)}&select=id`,
          {
            headers: {
              apikey: supabaseServiceRoleKey,
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
          }
        );
        const remaining = (await countFetch.json()) as { id: string }[];
        const newCount = Array.isArray(remaining) ? remaining.length : 0;

        await fetch(
          `${supabaseUrl}/rest/v1/threads?id=eq.${encodeURIComponent(replyThreadId)}&site_id=eq.${encodeURIComponent(instanceId)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseServiceRoleKey,
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
            body: JSON.stringify({ reply_count: newCount }),
          }
        );
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: "Unsupported action" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
