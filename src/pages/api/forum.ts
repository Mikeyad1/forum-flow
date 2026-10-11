import { auth } from "@wix/essentials";
import { appInstances } from "@wix/app-management";
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
    const body = (await request.json()) as CreateThreadBody;
    let userId: string | undefined;
    let subjectType: string | undefined;
    try {
      const tokenInfo = await auth.getTokenInfo();
      userId = tokenInfo.subjectId;
      subjectType = tokenInfo.subjectType;
    } catch {
      return new Response(JSON.stringify({ error: "You must be logged in to post." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
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
        const emailPrefix = memberData?.loginEmail?.split('@')[0]?.toLowerCase() ?? '';
        const nickname = memberData?.profile?.nickname?.trim() ?? '';
        const firstName = memberData?.contact?.firstName?.trim() ?? '';
        const lastName = memberData?.contact?.lastName?.trim() ?? '';
        const nicknameLooksLikeEmail =
          !!nickname &&
          (nickname.includes('@') || (emailPrefix !== '' && nickname.toLowerCase() === emailPrefix));

        if (nickname && !nicknameLooksLikeEmail) {
          userName = nickname;
        } else if (firstName) {
          userName = lastName ? `${firstName} ${lastName.charAt(0)}.` : firstName;
        } else {
          userName = 'Member';
        }
      } catch {
        // keep default
      }
    }

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
      action !== "delete_reply" &&
      action !== "edit_thread" &&
      action !== "edit_reply"
    ) {
      return new Response(
        JSON.stringify({
          error:
            'Unsupported action. Use "create_thread", "create_reply", "delete_thread", "delete_reply", "edit_thread", or "edit_reply".',
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

      // Plan limit check
      try {
        const elevatedGetAppInstance = auth.elevate(appInstances.getAppInstance);
        const instanceResponse = await elevatedGetAppInstance();
        const isFree = instanceResponse.instance?.isFree ?? true;
        if (isFree) {
          const countRes = await fetch(
            `${supabaseUrl}/rest/v1/threads?site_id=eq.${encodeURIComponent(instanceId)}&select=id`,
            {
              headers: {
                apikey: supabaseServiceRoleKey,
                Authorization: `Bearer ${supabaseServiceRoleKey}`,
              },
            }
          );
          const rows = (await countRes.json()) as { id: string }[];
          if (Array.isArray(rows) && rows.length >= 25) {
            return new Response(
              JSON.stringify({ error: "LIMIT_REACHED", type: "threads" }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      } catch {
        // If plan check fails, allow the action
      }

      if (!title || !title.trim()) {
        return new Response(
          JSON.stringify({ error: "Missing required field: title" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const insertPayload = {
        title,
        body: content ?? "",
        category_id: category_id ?? null,
        site_id: instanceId,
        user_id: userId,
        user_name: userName,
        author_name: userName,
        author_type: subjectType,
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

      // Plan limit check
      try {
        const elevatedGetAppInstance = auth.elevate(appInstances.getAppInstance);
        const instanceResponse = await elevatedGetAppInstance();
        const isFree = instanceResponse.instance?.isFree ?? true;
        if (isFree) {
          const countRes = await fetch(
            `${supabaseUrl}/rest/v1/replies?site_id=eq.${encodeURIComponent(instanceId)}&select=id`,
            {
              headers: {
                apikey: supabaseServiceRoleKey,
                Authorization: `Bearer ${supabaseServiceRoleKey}`,
              },
            }
          );
          const rows = (await countRes.json()) as { id: string }[];
          if (Array.isArray(rows) && rows.length >= 50) {
            return new Response(
              JSON.stringify({ error: "LIMIT_REACHED", type: "replies" }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      } catch {
        // If plan check fails, allow the action
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
        author_type: subjectType,
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
    } else if (action === "edit_thread") {
      if (!thread_id || !title || !title.trim()) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: thread_id, title" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const threadUrl = `${supabaseUrl}/rest/v1/threads?id=eq.${encodeURIComponent(String(thread_id))}&site_id=eq.${encodeURIComponent(instanceId)}`;

      const threadResponse = await fetch(`${threadUrl}&select=user_id`, {
        headers: {
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
        },
      });

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

      const patchResponse = await fetch(threadUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ title: title.trim(), body: (content ?? "").trim(), edited_at: new Date().toISOString() }),
      });

      if (!patchResponse.ok) {
        const errorText = await patchResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to update thread", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const updated = (await patchResponse.json()) as unknown;
      const updatedThread = Array.isArray(updated) && updated.length > 0 ? updated[0] : updated;

      return new Response(JSON.stringify(updatedThread), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "edit_reply") {
      if (!reply_id || !content || !content.trim()) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: reply_id, content" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const replyUrl = `${supabaseUrl}/rest/v1/replies?id=eq.${encodeURIComponent(String(reply_id))}&site_id=eq.${encodeURIComponent(instanceId)}`;

      const replyResponse = await fetch(`${replyUrl}&select=user_id`, {
        headers: {
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
        },
      });

      if (!replyResponse.ok) {
        const errorText = await replyResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to load reply", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const replyRows = (await replyResponse.json()) as { user_id?: string }[];
      const reply = Array.isArray(replyRows) && replyRows.length > 0 ? replyRows[0] : null;

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

      const patchResponse = await fetch(replyUrl, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseServiceRoleKey,
          Authorization: `Bearer ${supabaseServiceRoleKey}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({ body: content.trim(), edited_at: new Date().toISOString() }),
      });

      if (!patchResponse.ok) {
        const errorText = await patchResponse.text();
        return new Response(
          JSON.stringify({ error: "Failed to update reply", details: errorText }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const updated = (await patchResponse.json()) as unknown;
      const updatedReply = Array.isArray(updated) && updated.length > 0 ? updated[0] : updated;

      return new Response(JSON.stringify(updatedReply), {
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

    if (action && action.startsWith("admin_") && tokenInfo.subjectType !== "USER") {
      return new Response(JSON.stringify({ error: "Not allowed" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "get_threads_with_identity") {
      const authHeader = request.headers.get("authorization");

      const [identityResult, threadsResponse, staffResponse] = await Promise.all([
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
          `${supabaseUrl}/rest/v1/threads?site_id=eq.${encodeURIComponent(instanceId)}&select=*&order=is_pinned.desc,created_at.desc`,
          {
            headers: {
              apikey: supabaseServiceRoleKey,
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
          }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/staff?site_id=eq.${encodeURIComponent(instanceId)}&select=user_id`,
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

      let threads = (await threadsResponse.json()) as unknown[];

      // Seed demo threads the first time a site's forum loads with no threads
      if (Array.isArray(threads) && threads.length === 0) {
        try {
          const seedMarkRes = await fetch(
            `${supabaseUrl}/rest/v1/seeded_sites?on_conflict=site_id`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: supabaseServiceRoleKey,
                Authorization: `Bearer ${supabaseServiceRoleKey}`,
                Prefer: "resolution=ignore-duplicates,return=representation",
              },
              body: JSON.stringify({ site_id: instanceId }),
            }
          );
          const seedMarkRows = seedMarkRes.ok ? ((await seedMarkRes.json()) as unknown[]) : [];
          const isFirstSeed = Array.isArray(seedMarkRows) && seedMarkRows.length > 0;

          if (isFirstSeed) {
            const nowMs = Date.now();
            const demoInsertRes = await fetch(`${supabaseUrl}/rest/v1/threads`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: supabaseServiceRoleKey,
                Authorization: `Bearer ${supabaseServiceRoleKey}`,
                Prefer: "return=representation",
              },
              body: JSON.stringify([
                {
                  site_id: instanceId,
                  title: "Welcome to the forum! 👋",
                  body: "This is your community space — feel free to introduce yourself, ask questions, or start a conversation. We're glad you're here!",
                  author_name: "ForumFlow",
                  user_name: "ForumFlow",
                  user_id: "system",
                  created_at: new Date(nowMs).toISOString(),
                },
                {
                  site_id: instanceId,
                  title: "What would you like to discuss here?",
                  body: 'This is just an example thread to show you what ForumFlow looks like. Click "New Thread" to start your own conversation!',
                  author_name: "ForumFlow",
                  user_name: "ForumFlow",
                  user_id: "system",
                  created_at: new Date(nowMs - 1000).toISOString(),
                },
              ]),
            });
            if (demoInsertRes.ok) {
              const inserted = (await demoInsertRes.json()) as unknown[];
              if (Array.isArray(inserted)) {
                threads = inserted;
              }
            }
          }
        } catch {
          // Seeding is best-effort; never block loading the forum
        }
      }

      let staffUserIds: string[] = [];
      if (staffResponse.ok) {
        const staffRows = (await staffResponse.json()) as { user_id: string }[];
        staffUserIds = Array.isArray(staffRows) ? staffRows.map((r) => r.user_id) : [];
      }

      return new Response(
        JSON.stringify({
          threads,
          subjectType: identityResult?.subjectType ?? null,
          userId: identityResult?.subjectId ?? null,
          staffUserIds,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    } else if (action === "get_threads") {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/threads?site_id=eq.${encodeURIComponent(instanceId)}&select=*&order=is_pinned.desc,created_at.desc`,
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

    } else if (action === "admin_pin_thread") {
      const threadId = url.searchParams.get("thread_id");
      const pinValue = url.searchParams.get("pin"); // "true" or "false"

      if (!threadId || pinValue === null) {
        return new Response(JSON.stringify({ error: "Missing thread_id or pin" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const isPinned = pinValue === "true";

      const patchResponse = await fetch(
        `${supabaseUrl}/rest/v1/threads?id=eq.${encodeURIComponent(threadId)}&site_id=eq.${encodeURIComponent(instanceId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
          body: JSON.stringify({ is_pinned: isPinned }),
        }
      );

      if (!patchResponse.ok) {
        return new Response(JSON.stringify({ error: "Failed to update pin status" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, is_pinned: isPinned }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "admin_list_authors") {
      const sbHeaders = {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      };
      const siteFilter = `site_id=eq.${encodeURIComponent(instanceId)}`;
      const [threadsRes, repliesRes, staffRes] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/threads?${siteFilter}&select=user_id,user_name,author_name,created_at,author_type`, { headers: sbHeaders }),
        fetch(`${supabaseUrl}/rest/v1/replies?${siteFilter}&select=user_id,user_name,author_name,created_at,author_type`, { headers: sbHeaders }),
        fetch(`${supabaseUrl}/rest/v1/staff?${siteFilter}&select=user_id`, { headers: sbHeaders }),
      ]);
      if (!threadsRes.ok || !repliesRes.ok || !staffRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to load authors" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      type AuthorRow = { user_id: string | null; user_name: string | null; author_name: string | null; created_at: string | null; author_type: string | null };
      const rows = [
        ...((await threadsRes.json()) as AuthorRow[]),
        ...((await repliesRes.json()) as AuthorRow[]),
      ];
      const staffRows = (await staffRes.json()) as { user_id: string }[];
      const staffSet = new Set(staffRows.map((r) => r.user_id));
      const latest = new Map<string, { user_name: string; created_at: string }>();
      for (const row of rows) {
        if (!row.user_id || row.user_id === "system") continue;
        if (row.author_type === "VISITOR") continue;
        const name = row.user_name ?? row.author_name ?? "Unknown";
        const createdAt = row.created_at ?? "";
        const existing = latest.get(row.user_id);
        if (!existing || createdAt > existing.created_at) {
          latest.set(row.user_id, { user_name: name, created_at: createdAt });
        }
      }
      const authors = Array.from(latest.entries())
        .map(([user_id, v]) => ({ user_id, user_name: v.user_name, is_staff: staffSet.has(user_id) }))
        .sort((a, b) => a.user_name.localeCompare(b.user_name));
      return new Response(JSON.stringify(authors), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "admin_set_staff") {
      const targetUserId = url.searchParams.get("user_id");
      const staffValue = url.searchParams.get("staff");
      if (!targetUserId || (staffValue !== "true" && staffValue !== "false")) {
        return new Response(JSON.stringify({ error: "Missing user_id or staff" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      let staffRes: Response;
      if (staffValue === "true") {
        staffRes = await fetch(`${supabaseUrl}/rest/v1/staff?on_conflict=site_id,user_id`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
            Prefer: "resolution=ignore-duplicates,return=minimal",
          },
          body: JSON.stringify({ site_id: instanceId, user_id: targetUserId }),
        });
      } else {
        staffRes = await fetch(
          `${supabaseUrl}/rest/v1/staff?site_id=eq.${encodeURIComponent(instanceId)}&user_id=eq.${encodeURIComponent(targetUserId)}`,
          {
            method: "DELETE",
            headers: {
              apikey: supabaseServiceRoleKey,
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
          }
        );
      }
      if (!staffRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to update staff" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true, is_staff: staffValue === "true" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "get_likes") {
      const threadId = url.searchParams.get("thread_id");
      const authHeader = request.headers.get("authorization");

      let currentUserId: string | null = null;
      if (authHeader) {
        const tokenRes = await fetch("https://www.wixapis.com/oauth2/token-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: authHeader }),
        });
        if (tokenRes.ok) {
          const info = (await tokenRes.json()) as { subjectId?: string; subjectType?: string };
          if (info.subjectType === "MEMBER") {
            currentUserId = info.subjectId ?? null;
          }
        }
      }

      if (!threadId) {
        return new Response(JSON.stringify({ error: "Missing thread_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const likesRes = await fetch(
        `${supabaseUrl}/rest/v1/thread_likes?thread_id=eq.${encodeURIComponent(threadId)}&site_id=eq.${encodeURIComponent(instanceId)}&select=user_id`,
        {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      const likes = (await likesRes.json()) as { user_id: string }[];
      const likeCount = Array.isArray(likes) ? likes.length : 0;
      const likedByMe = currentUserId ? likes.some((l) => l.user_id === currentUserId) : false;

      return new Response(JSON.stringify({ likeCount, likedByMe }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "toggle_like") {
      const threadId = url.searchParams.get("thread_id");
      const authHeader = request.headers.get("authorization");

      if (!threadId) {
        return new Response(JSON.stringify({ error: "Missing thread_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const tokenRes = await fetch("https://www.wixapis.com/oauth2/token-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authHeader }),
      });

      if (!tokenRes.ok) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const tokenData = (await tokenRes.json()) as { subjectId?: string; subjectType?: string };

      if (tokenData.subjectType !== "MEMBER") {
        return new Response(JSON.stringify({ error: "Members only" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      const userId = tokenData.subjectId!;

      const existingRes = await fetch(
        `${supabaseUrl}/rest/v1/thread_likes?thread_id=eq.${encodeURIComponent(threadId)}&user_id=eq.${encodeURIComponent(userId)}&site_id=eq.${encodeURIComponent(instanceId)}&select=id`,
        {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      const existing = (await existingRes.json()) as { id: string }[];
      const alreadyLiked = Array.isArray(existing) && existing.length > 0;

      if (alreadyLiked) {
        await fetch(
          `${supabaseUrl}/rest/v1/thread_likes?thread_id=eq.${encodeURIComponent(threadId)}&user_id=eq.${encodeURIComponent(userId)}&site_id=eq.${encodeURIComponent(instanceId)}`,
          {
            method: "DELETE",
            headers: {
              apikey: supabaseServiceRoleKey,
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
          }
        );
        return new Response(JSON.stringify({ liked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } else {
        await fetch(`${supabaseUrl}/rest/v1/thread_likes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            thread_id: threadId,
            user_id: userId,
            site_id: instanceId,
          }),
        });
        return new Response(JSON.stringify({ liked: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

    } else if (action === "get_reply_likes") {
      const replyId = url.searchParams.get("reply_id");
      const authHeader = request.headers.get("authorization");

      let currentUserId: string | null = null;
      if (authHeader) {
        const tokenRes = await fetch("https://www.wixapis.com/oauth2/token-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: authHeader }),
        });
        if (tokenRes.ok) {
          const info = (await tokenRes.json()) as { subjectId?: string; subjectType?: string };
          if (info.subjectType === "MEMBER") {
            currentUserId = info.subjectId ?? null;
          }
        }
      }

      if (!replyId) {
        return new Response(JSON.stringify({ error: "Missing reply_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const likesRes = await fetch(
        `${supabaseUrl}/rest/v1/reply_likes?reply_id=eq.${encodeURIComponent(replyId)}&site_id=eq.${encodeURIComponent(instanceId)}&select=user_id`,
        {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      const likes = (await likesRes.json()) as { user_id: string }[];
      const likeCount = Array.isArray(likes) ? likes.length : 0;
      const likedByMe = currentUserId ? likes.some((l) => l.user_id === currentUserId) : false;

      return new Response(JSON.stringify({ likeCount, likedByMe }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else if (action === "toggle_reply_like") {
      const replyId = url.searchParams.get("reply_id");
      const authHeader = request.headers.get("authorization");

      if (!replyId) {
        return new Response(JSON.stringify({ error: "Missing reply_id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const tokenRes = await fetch("https://www.wixapis.com/oauth2/token-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authHeader }),
      });

      if (!tokenRes.ok) {
        return new Response(JSON.stringify({ error: "Not authenticated" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      const tokenData = (await tokenRes.json()) as { subjectId?: string; subjectType?: string };

      if (tokenData.subjectType !== "MEMBER") {
        return new Response(JSON.stringify({ error: "Members only" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      const userId = tokenData.subjectId!;

      const existingRes = await fetch(
        `${supabaseUrl}/rest/v1/reply_likes?reply_id=eq.${encodeURIComponent(replyId)}&user_id=eq.${encodeURIComponent(userId)}&site_id=eq.${encodeURIComponent(instanceId)}&select=id`,
        {
          headers: {
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
          },
        }
      );

      const existing = (await existingRes.json()) as { id: string }[];
      const alreadyLiked = Array.isArray(existing) && existing.length > 0;

      if (alreadyLiked) {
        await fetch(
          `${supabaseUrl}/rest/v1/reply_likes?reply_id=eq.${encodeURIComponent(replyId)}&user_id=eq.${encodeURIComponent(userId)}&site_id=eq.${encodeURIComponent(instanceId)}`,
          {
            method: "DELETE",
            headers: {
              apikey: supabaseServiceRoleKey,
              Authorization: `Bearer ${supabaseServiceRoleKey}`,
            },
          }
        );
        return new Response(JSON.stringify({ liked: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } else {
        await fetch(`${supabaseUrl}/rest/v1/reply_likes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseServiceRoleKey,
            Authorization: `Bearer ${supabaseServiceRoleKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            reply_id: replyId,
            user_id: userId,
            site_id: instanceId,
          }),
        });
        return new Response(JSON.stringify({ liked: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

    } else if (action === "get_plan") {
      try {
        const elevatedGetAppInstance = auth.elevate(appInstances.getAppInstance);
        const instanceResponse = await elevatedGetAppInstance();
        const isFree = instanceResponse.instance?.isFree ?? true;
        return new Response(JSON.stringify({ isFree }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ isFree: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

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
