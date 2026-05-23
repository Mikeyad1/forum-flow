import { appInstances } from '@wix/app-management';

const DEMO_THREADS = [
  {
    title: 'Welcome to the forum! 👋',
    body: 'This is your new community forum. Feel free to create threads and start conversations.',
  },
  {
    title: 'How do I post a reply?',
    body: 'Click on any thread to open it, then use the reply box at the bottom to join the conversation.',
  },
];

export default appInstances.onAppInstanceInstalled(async (event) => {
  const instanceId = event.metadata.instanceId;

  const supabaseUrl = (import.meta.env.PUBLIC_SUPABASE_URL as string);
  const supabaseKey = (import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string);

  for (const thread of DEMO_THREADS) {
    await fetch(`${supabaseUrl}/rest/v1/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal',
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
  }
});
