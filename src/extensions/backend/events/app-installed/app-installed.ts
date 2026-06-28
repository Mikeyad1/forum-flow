import { appInstances } from '@wix/app-management';
import { auth } from '@wix/essentials';

const DEMO_THREADS = [
  {
    title: 'Welcome to the forum! 👋',
    body: "This is your community space — feel free to introduce yourself, ask questions, or start a conversation. We're glad you're here!",
  },
  {
    title: 'What would you like to discuss here?',
    body: 'This is just an example thread to show you what ForumFlow looks like. Click "New Thread" to start your own conversation!',
  },
];

export default appInstances.onAppInstanceInstalled((event) => {
  const instanceId = event.metadata.instanceId;
  void (async () => {

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
  const supabaseKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;
  const resendApiKey = import.meta.env.RESEND_API_KEY as string | undefined;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[ForumFlow] app-installed: missing Supabase env vars', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
    });
    return;
  }

  for (const thread of DEMO_THREADS) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/threads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          site_id: instanceId,
          title: thread.title,
          body: thread.body,
          author_name: 'ForumFlow',
          user_name: 'ForumFlow',
          user_id: 'system',
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('[ForumFlow] app-installed: demo thread failed', res.status, text);
      }
    } catch (err) {
      console.error('[ForumFlow] app-installed: demo thread exception', err);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));

  if (!resendApiKey) {
    console.error('[ForumFlow] app-installed: missing RESEND_API_KEY');
    return;
  }

  try {
    const elevatedGetAppInstance = auth.elevate(appInstances.getAppInstance);
    const { site } = await elevatedGetAppInstance();
    const ownerEmail = site?.ownerInfo?.email;

    if (ownerEmail) {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: ownerEmail,
          subject: 'Your ForumFlow forum is ready! 🎉',
          html: `
            <h2>Welcome to ForumFlow!</h2>
            <p>Your community forum has been installed successfully.</p>
            <p><strong>Here's how to get started:</strong></p>
            <ol>
              <li>Go to your Wix Editor and add the ForumFlow widget to any page</li>
              <li>Customize the forum title and colors in the Settings panel</li>
              <li>Publish your site — your forum is live!</li>
            </ol>
            <p>Need help? Reply to this email anytime.</p>
            <p>— The ForumFlow Team</p>
          `,
        }),
      });
      if (!emailRes.ok) {
        const text = await emailRes.text();
        console.error('[ForumFlow] app-installed: email failed', emailRes.status, text);
      }
    }
  } catch (err) {
    console.error('[ForumFlow] app-installed: email exception', err);
  }
  })();
});
