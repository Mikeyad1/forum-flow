import React, { useEffect, useMemo, useState, type FC } from 'react';
import { editor, widget } from '@wix/editor';
import { createClient } from '@wix/sdk';
import { httpClient } from '@wix/essentials';

type PostingAudience = 'members_only' | 'everyone';
type Layout = 'full' | 'highlights';
type Plan = 'loading' | 'free' | 'pro' | 'unknown';

const APP_ID = 'ae9501ff-1e53-4cc5-83ff-36b974e644b1';
const DEFAULT_TITLE = 'Community';
const DEFAULT_NEW_THREAD_LABEL = 'Start a discussion';
const DEFAULT_CUSTOM_COLOR = '#2563EB';
const UI_ACCENT = '#116DFF';
const COLOR_PRESETS = ['#2563EB', '#1F6F5C', '#B45309', '#BE185D', '#111827'];

const PRO_PERKS = [
  'Remove "Powered by ForumFlow"',
  'Moderate and pin posts from your dashboard',
  'Team badges for your staff',
  'Reply emails that bring members back',
  'Unlimited posts and replies',
];

const ROOT_STYLE: React.CSSProperties = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif',
  color: '#1a1f27',
  fontSize: '14px',
};

const SECTION_STYLE: React.CSSProperties = {
  padding: '16px 18px',
  borderBottom: '1px solid #eef1f4',
  display: 'grid',
  gap: '10px',
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  fontWeight: 700,
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'grid',
  gap: '5px',
  fontSize: '12px',
  color: '#3b4450',
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #c9d2db',
  borderRadius: '6px',
  padding: '7px 10px',
  fontSize: '14px',
  fontFamily: 'inherit',
  color: '#1a1f27',
};

const HINT_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: '12px',
  lineHeight: 1.4,
  color: '#5c6670',
};

const selectAudience = (value: unknown, fallback: PostingAudience): PostingAudience => {
  return value === 'members_only' || value === 'everyone' ? value : fallback;
};

const parseBooleanProp = (value: unknown, fallback: boolean): boolean => {
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return fallback;
};

const Switch: FC<{ checked: boolean; label: string; onChange: (next: boolean) => void }> = ({
  checked,
  label,
  onChange,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    style={{
      position: 'relative',
      width: '36px',
      height: '20px',
      borderRadius: '999px',
      border: 'none',
      padding: 0,
      flexShrink: 0,
      cursor: 'pointer',
      backgroundColor: checked ? UI_ACCENT : '#c9d2db',
      transition: 'background-color 0.15s ease',
    }}
  >
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '2px',
        left: checked ? '18px' : '2px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        backgroundColor: '#ffffff',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
        transition: 'left 0.15s ease',
      }}
    />
  </button>
);

const CheckIcon: FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke={UI_ACCENT}
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flexShrink: 0, marginTop: '2px' }}
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const SettingsPanel: FC = () => {
  const client = useMemo(
    () =>
      createClient({
        host: editor.host(),
        modules: { widget },
      }),
    [],
  );

  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [newThreadLabel, setNewThreadLabel] = useState(DEFAULT_NEW_THREAD_LABEL);
  const [aboutText, setAboutText] = useState('');
  const [layout, setLayout] = useState<Layout>('full');
  const [threadsAudience, setThreadsAudience] = useState<PostingAudience>('everyone');
  const [repliesAudience, setRepliesAudience] = useState<PostingAudience>('everyone');
  const [color, setColor] = useState('');
  const [customColor, setCustomColor] = useState(DEFAULT_CUSTOM_COLOR);
  const [replyNotifications, setReplyNotifications] = useState(true);
  const [plan, setPlan] = useState<Plan>('loading');
  const [instanceId, setInstanceId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadProps = async () => {
      const [
        savedTitle,
        savedNewThreadLabel,
        savedColor,
        savedThreadAudience,
        savedReplyAudience,
        savedReplyNotifications,
        savedAbout,
        savedLayout,
      ] = await Promise.all([
        client.widget.getProp('title'),
        client.widget.getProp('new_thread_label'),
        client.widget.getProp('color'),
        client.widget.getProp('who_can_post_threads'),
        client.widget.getProp('who_can_post_replies'),
        client.widget.getProp('reply_notifications'),
        client.widget.getProp('about_text'),
        client.widget.getProp('layout'),
      ]);

      if (!isMounted) {
        return;
      }

      setTitle(typeof savedTitle === 'string' && savedTitle.length > 0 ? savedTitle : DEFAULT_TITLE);
      setNewThreadLabel(
        typeof savedNewThreadLabel === 'string' && savedNewThreadLabel.length > 0
          ? savedNewThreadLabel
          : DEFAULT_NEW_THREAD_LABEL,
      );
      if (typeof savedColor === 'string' && savedColor.trim().length > 0) {
        setColor(savedColor);
        setCustomColor(savedColor);
      } else {
        setColor('');
      }
      setThreadsAudience(selectAudience(savedThreadAudience, 'everyone'));
      setRepliesAudience(selectAudience(savedReplyAudience, 'everyone'));
      setReplyNotifications(parseBooleanProp(savedReplyNotifications, true));
      setAboutText(typeof savedAbout === 'string' ? savedAbout : '');
      setLayout(savedLayout === 'highlights' ? 'highlights' : 'full');
    };

    void loadProps();
    return () => {
      isMounted = false;
    };
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    const baseApiUrl = new URL(import.meta.url).origin;
    httpClient
      .fetchWithAuth(`${baseApiUrl}/api/forum?action=get_plan`)
      .then((r) => (r.ok ? (r.json() as Promise<{ isFree?: boolean; instanceId?: string | null }>) : null))
      .then((data) => {
        if (cancelled) return;
        if (!data || typeof data.isFree !== 'boolean') {
          setPlan('unknown');
          return;
        }
        setPlan(data.isFree ? 'free' : 'pro');
        setInstanceId(data.instanceId ?? null);
      })
      .catch(() => {
        if (!cancelled) setPlan('unknown');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const upgradeUrl = `https://www.wix.com/apps/upgrade/${APP_ID}${instanceId ? `?appInstanceId=${instanceId}` : ''}`;
  const matchSiteColor = color === '';
  const isCustomColor = !COLOR_PRESETS.some((c) => c.toLowerCase() === customColor.toLowerCase());
  const audienceValue: PostingAudience | null = threadsAudience === repliesAudience ? threadsAudience : null;

  const updateTitle = async (nextValue: string) => {
    setTitle(nextValue);
    await client.widget.setProp('title', nextValue);
  };

  const updateNewThreadLabel = async (nextValue: string) => {
    setNewThreadLabel(nextValue);
    await client.widget.setProp('new_thread_label', nextValue);
  };

  const updateAboutText = async (nextValue: string) => {
    setAboutText(nextValue);
    await client.widget.setProp('about_text', nextValue);
  };

  const selectLayout = async (nextValue: Layout) => {
    setLayout(nextValue);
    await client.widget.setProp('layout', nextValue);
  };

  const selectWhoCanPost = async (nextValue: PostingAudience) => {
    setThreadsAudience(nextValue);
    setRepliesAudience(nextValue);
    await client.widget.setProp('who_can_post_threads', nextValue);
    await client.widget.setProp('who_can_post_replies', nextValue);
  };

  const toggleMatchSiteColor = async (nextMatch: boolean) => {
    const nextValue = nextMatch ? '' : customColor;
    setColor(nextValue);
    await client.widget.setProp('color', nextValue);
  };

  const updateCustomColor = async (nextValue: string) => {
    setCustomColor(nextValue);
    setColor(nextValue);
    await client.widget.setProp('color', nextValue);
  };

  const updateReplyNotifications = async (nextValue: boolean) => {
    setReplyNotifications(nextValue);
    await client.widget.setProp('reply_notifications', String(nextValue));
  };

  const layoutOptions: { value: Layout; label: string; hint: string; preview: React.ReactNode }[] = [
    {
      value: 'full',
      label: 'Full forum',
      hint: 'For a page of its own',
      preview: (
        <svg viewBox="0 0 120 72" width="100%" aria-hidden="true" style={{ display: 'block', borderRadius: '6px' }}>
          <rect width="120" height="72" fill="#f4f5f6" />
          <rect x="10" y="8" width="40" height="6" rx="3" fill="#9ca3af" />
          <rect x="10" y="20" width="100" height="13" rx="3" fill="#ffffff" />
          <rect x="10" y="37" width="100" height="13" rx="3" fill="#ffffff" />
          <rect x="10" y="54" width="100" height="13" rx="3" fill="#ffffff" />
        </svg>
      ),
    },
    {
      value: 'highlights',
      label: 'Highlights',
      hint: 'Latest 3 posts, for the home page',
      preview: (
        <svg viewBox="0 0 120 72" width="100%" aria-hidden="true" style={{ display: 'block', borderRadius: '6px' }}>
          <rect width="120" height="72" fill="#f4f5f6" />
          <rect x="10" y="8" width="40" height="6" rx="3" fill="#9ca3af" />
          <rect x="10" y="20" width="31" height="30" rx="3" fill="#ffffff" />
          <rect x="45" y="20" width="30" height="30" rx="3" fill="#ffffff" />
          <rect x="79" y="20" width="31" height="30" rx="3" fill="#ffffff" />
          <rect x="10" y="55" width="100" height="9" rx="3" fill="#ffffff" />
        </svg>
      ),
    },
  ];

  return (
    <section style={ROOT_STYLE}>
      <div style={SECTION_STYLE}>
        <p style={SECTION_TITLE_STYLE}>Layout</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {layoutOptions.map((opt) => {
            const selected = layout === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={selected}
                onClick={() => void selectLayout(opt.value)}
                style={{
                  display: 'grid',
                  gap: '6px',
                  textAlign: 'left',
                  background: '#ffffff',
                  border: selected ? `2px solid ${UI_ACCENT}` : '1px solid #d5dbe2',
                  borderRadius: '10px',
                  padding: selected ? '7px' : '8px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: '#1a1f27',
                }}
              >
                {opt.preview}
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{opt.label}</span>
                <span style={{ fontSize: '11px', color: '#5c6670', lineHeight: 1.35 }}>{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={SECTION_STYLE}>
        <p style={SECTION_TITLE_STYLE}>Text</p>
        <label style={LABEL_STYLE}>
          Forum title
          <input type="text" value={title} onChange={(e) => void updateTitle(e.target.value)} style={INPUT_STYLE} />
        </label>
        <label style={LABEL_STYLE}>
          Button label
          <input
            type="text"
            value={newThreadLabel}
            onChange={(e) => void updateNewThreadLabel(e.target.value)}
            style={INPUT_STYLE}
          />
        </label>
        <label style={LABEL_STYLE}>
          About your community (optional)
          <textarea
            value={aboutText}
            onChange={(e) => void updateAboutText(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="A short welcome shown next to your posts"
            style={{ ...INPUT_STYLE, resize: 'vertical' }}
          />
          <span style={{ ...HINT_STYLE, textAlign: 'right' }}>{aboutText.length}/300</span>
        </label>
      </div>

      <div style={SECTION_STYLE}>
        <p style={SECTION_TITLE_STYLE}>Who can post</p>
        <div
          role="group"
          aria-label="Who can post"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#eef1f4', borderRadius: '8px', padding: '3px' }}
        >
          {([
            { value: 'everyone' as const, label: 'Everyone' },
            { value: 'members_only' as const, label: 'Members only' },
          ]).map((opt) => {
            const selected = audienceValue === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={selected}
                onClick={() => void selectWhoCanPost(opt.value)}
                style={{
                  border: 'none',
                  borderRadius: '6px',
                  background: selected ? '#ffffff' : 'transparent',
                  boxShadow: selected ? '0 1px 2px rgba(22, 45, 61, 0.12)' : 'none',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: selected ? 600 : 500,
                  color: selected ? '#1a1f27' : '#4a5562',
                  padding: '7px',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {audienceValue === null ? (
          <p style={HINT_STYLE}>Right now new posts and replies have different rules. Pick one to use it for both.</p>
        ) : (
          <p style={HINT_STYLE}>
            {audienceValue === 'everyone'
              ? 'Visitors can post with a name. Members post with their profile.'
              : 'Only logged-in site members can start posts and reply.'}
          </p>
        )}
      </div>

      <div style={SECTION_STYLE}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'grid', gap: '3px' }}>
            <p style={SECTION_TITLE_STYLE}>Match my site's colors</p>
            <p style={HINT_STYLE}>Buttons and accents follow your site's link color</p>
          </div>
          <Switch
            checked={matchSiteColor}
            label="Match my site's colors"
            onChange={(next) => void toggleMatchSiteColor(next)}
          />
        </div>
        {!matchSiteColor ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#3b4450' }}>Accent color</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {COLOR_PRESETS.map((preset) => {
                const selected = customColor.toLowerCase() === preset.toLowerCase();
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-label={`Use color ${preset}`}
                    aria-pressed={selected}
                    onClick={() => void updateCustomColor(preset)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      backgroundColor: preset,
                      boxShadow: selected
                        ? `0 0 0 2px #ffffff, 0 0 0 4px ${preset}`
                        : 'inset 0 0 0 1px rgba(0, 0, 0, 0.08)',
                    }}
                  />
                );
              })}
              {isCustomColor ? (
                <span
                  role="img"
                  aria-label={`Current color ${customColor}`}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: customColor,
                    boxShadow: `0 0 0 2px #ffffff, 0 0 0 4px ${customColor}`,
                  }}
                />
              ) : null}
              <label
                title="Pick any color"
                style={{
                  position: 'relative',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  boxSizing: 'border-box',
                  border: '1px dashed #9aa5b1',
                  backgroundColor: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#5c6670',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                <input
                  type="color"
                  aria-label="Pick a custom color"
                  value={customColor}
                  onChange={(e) => void updateCustomColor(e.target.value)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>

      {plan === 'free' ? (
        <div style={{ margin: '14px', borderRadius: '10px', background: '#eef4ff', padding: '14px 16px', display: 'grid', gap: '10px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: UI_ACCENT }}>
            ForumFlow Pro
          </span>
          <span style={{ fontSize: '14px', fontWeight: 700 }}>Run it like a real community</span>
          {PRO_PERKS.map((perk) => (
            <span key={perk} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px', lineHeight: 1.45, color: '#3b4450' }}>
              <CheckIcon />
              {perk}
            </span>
          ))}
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '40px',
              borderRadius: '999px',
              background: UI_ACCENT,
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Upgrade to Pro
          </a>
          <span style={{ ...HINT_STYLE, textAlign: 'center' }}>New to Pro? It starts with a 14-day free trial.</span>
        </div>
      ) : null}

      {plan === 'pro' ? (
        <div style={{ ...SECTION_STYLE, borderBottom: 'none' }}>
          <span
            style={{
              justifySelf: 'start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700,
              color: UI_ACCENT,
              background: '#eef4ff',
              borderRadius: '999px',
              padding: '4px 10px',
            }}
          >
            <CheckIcon />
            Pro is active
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'grid', gap: '3px' }}>
              <p style={SECTION_TITLE_STYLE}>Reply emails</p>
              <p style={HINT_STYLE}>Members get an email when someone replies to their post</p>
            </div>
            <Switch
              checked={replyNotifications}
              label="Reply emails"
              onChange={(next) => void updateReplyNotifications(next)}
            />
          </div>
          <p style={HINT_STYLE}>Moderate, pin and add team members in your dashboard under Apps › ForumFlow.</p>
        </div>
      ) : null}
    </section>
  );
};

export default SettingsPanel;
