import { appInstances } from '@wix/app-management';
import { auth } from '@wix/essentials';

// Demo threads are seeded on first forum load (seeded_sites), not here.

const FROM = 'Mikey from ForumFlow <notifications@brivanolabs.com>';
const REPLY_TO = 'cloudslash3@gmail.com';
const SUBJECT = 'Your forum is one step from going live';

const TEXT = `Hi there,

Thanks for installing ForumFlow!

One step to go live: make sure the forum is on a page, then publish your site.

- Open your site in the Wix Editor.
- If you don't see the forum yet, click Add Elements > App Widgets > ForumFlow and drag it onto a page.
- Click Publish.

Tip: start the first discussion yourself, so visitors have something to reply to. The two example posts can be deleted anytime.

Questions? Just reply to this email.

- Mikey, Brivano Labs`;

const HTML = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:520px;">
  <p>Hi there,</p>
  <p>Thanks for installing ForumFlow!</p>
  <p style="font-size:16px;"><strong>One step to go live: make sure the forum is on a page, then publish your site.</strong></p>
  <ol style="padding-left:20px;margin:0 0 16px;">
    <li>Open your site in the Wix Editor.</li>
    <li>If you don't see the forum yet, click <strong>Add Elements &rsaquo; App Widgets &rsaquo; ForumFlow</strong> and drag it onto a page.</li>
    <li>Click <strong>Publish</strong>.</li>
  </ol>
  <p style="color:#4b5563;">Tip: start the first discussion yourself, so visitors have something to reply to. The two example posts can be deleted anytime.</p>
  <p>Questions? Just reply to this email.</p>
  <p>&mdash; Mikey, Brivano Labs</p>
</div>`;

export default appInstances.onAppInstanceInstalled(async (event) => {
  const instanceId = event.metadata.instanceId;
  const resendApiKey = import.meta.env.RESEND_API_KEY as string | undefined;

  if (!resendApiKey) {
    console.error('[ForumFlow] app-installed: missing RESEND_API_KEY');
    return;
  }

  try {
    const elevatedGetAppInstance = auth.elevate(appInstances.getAppInstance);
    const { site } = await elevatedGetAppInstance();
    const ownerEmail = site?.ownerInfo?.email;

    if (!ownerEmail) {
      console.log('[ForumFlow] app-installed: no owner email', { instanceId });
      return;
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: ownerEmail,
        reply_to: REPLY_TO,
        subject: SUBJECT,
        html: HTML,
        text: TEXT,
      }),
    });

    if (!emailRes.ok) {
      const text = await emailRes.text();
      console.error('[ForumFlow] app-installed: email failed', emailRes.status, text);
    } else {
      console.log('[ForumFlow] app-installed: welcome email sent', { instanceId });
    }
  } catch (err) {
    console.error('[ForumFlow] app-installed: email exception', err);
  }
});
