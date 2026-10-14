import React, { useEffect, useMemo, useState, type ChangeEvent, type FC } from 'react';
import { editor, widget } from '@wix/editor';
import { createClient } from '@wix/sdk';

type PostingAudience = 'members_only' | 'everyone';

const DEFAULT_TITLE = 'Community';
const DEFAULT_NEW_THREAD_LABEL = 'Start a discussion';
const DEFAULT_COLOR = '#2563EB';
const DEFAULT_THREADS_AUDIENCE: PostingAudience = 'everyone';
const DEFAULT_REPLIES_AUDIENCE: PostingAudience = 'everyone';
const DEFAULT_MEMBERS_CAN_DELETE = true;
const DEFAULT_THREADS_PER_PAGE = '10';
const DEFAULT_REPLY_NOTIFICATIONS = true;
const DEFAULT_ABOUT = '';
const DEFAULT_LAYOUT = 'full';
const THREADS_PER_PAGE_OPTIONS = ['5', '10', '15', '20', '30'];

const SETTINGS_CONTAINER_STYLE: React.CSSProperties = {
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  padding: '16px',
  color: '#111827',
  display: 'grid',
  gap: '12px',
};

const LABEL_STYLE: React.CSSProperties = {
  display: 'grid',
  gap: '6px',
  fontSize: '13px',
  fontWeight: 600,
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '14px',
  fontFamily: 'inherit',
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
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [whoCanPostThreads, setWhoCanPostThreads] = useState<PostingAudience>(
    DEFAULT_THREADS_AUDIENCE,
  );
  const [whoCanPostReplies, setWhoCanPostReplies] = useState<PostingAudience>(
    DEFAULT_REPLIES_AUDIENCE,
  );
  const [membersCanDelete, setMembersCanDelete] = useState(DEFAULT_MEMBERS_CAN_DELETE);
  const [threadsPerPage, setThreadsPerPage] = useState(DEFAULT_THREADS_PER_PAGE);
  const [replyNotifications, setReplyNotifications] = useState(DEFAULT_REPLY_NOTIFICATIONS);
  const [aboutText, setAboutText] = useState(DEFAULT_ABOUT);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);

  useEffect(() => {
    let isMounted = true;

    const loadProps = async () => {
      const [
        savedTitle,
        savedNewThreadLabel,
        savedColor,
        savedThreadAudience,
        savedReplyAudience,
        savedMembersCanDelete,
        savedThreadsPerPage,
        savedReplyNotifications,
        savedAbout,
        savedLayout,
      ] = await Promise.all([
        client.widget.getProp('title'),
        client.widget.getProp('new_thread_label'),
        client.widget.getProp('color'),
        client.widget.getProp('who_can_post_threads'),
        client.widget.getProp('who_can_post_replies'),
        client.widget.getProp('members_can_delete'),
        client.widget.getProp('threads_per_page'),
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
      setColor(typeof savedColor === 'string' && savedColor.length > 0 ? savedColor : DEFAULT_COLOR);
      setWhoCanPostThreads(selectAudience(savedThreadAudience, DEFAULT_THREADS_AUDIENCE));
      setWhoCanPostReplies(selectAudience(savedReplyAudience, DEFAULT_REPLIES_AUDIENCE));
      setMembersCanDelete(parseBooleanProp(savedMembersCanDelete, DEFAULT_MEMBERS_CAN_DELETE));
      const perPageStr = savedThreadsPerPage != null ? String(savedThreadsPerPage) : '';
      setThreadsPerPage(THREADS_PER_PAGE_OPTIONS.includes(perPageStr) ? perPageStr : DEFAULT_THREADS_PER_PAGE);
      setReplyNotifications(parseBooleanProp(savedReplyNotifications, DEFAULT_REPLY_NOTIFICATIONS));
      setAboutText(typeof savedAbout === 'string' ? savedAbout : DEFAULT_ABOUT);
      setLayout(savedLayout === 'highlights' ? 'highlights' : DEFAULT_LAYOUT);
    };

    void loadProps();
    return () => {
      isMounted = false;
    };
  }, [client]);

  const updateTitle = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setTitle(nextValue);
    await client.widget.setProp('title', nextValue);
  };

  const updateNewThreadLabel = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setNewThreadLabel(nextValue);
    await client.widget.setProp('new_thread_label', nextValue);
  };

  const updateAboutText = async (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setAboutText(nextValue);
    await client.widget.setProp('about_text', nextValue);
  };

  const selectLayout = async (nextValue: 'full' | 'highlights') => {
    setLayout(nextValue);
    await client.widget.setProp('layout', nextValue);
  };

  const updateColor = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setColor(nextValue);
    await client.widget.setProp('color', nextValue);
  };

  const updateThreadAudience = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = selectAudience(event.target.value, DEFAULT_THREADS_AUDIENCE);
    setWhoCanPostThreads(nextValue);
    await client.widget.setProp('who_can_post_threads', nextValue);
  };

  const updateReplyAudience = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = selectAudience(event.target.value, DEFAULT_REPLIES_AUDIENCE);
    setWhoCanPostReplies(nextValue);
    await client.widget.setProp('who_can_post_replies', nextValue);
  };

  const updateMembersCanDelete = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.checked;
    setMembersCanDelete(nextValue);
    await client.widget.setProp('members_can_delete', String(nextValue));
  };

  const updateReplyNotifications = async (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.checked;
    setReplyNotifications(nextValue);
    await client.widget.setProp('reply_notifications', String(nextValue));
  };

  const updateThreadsPerPage = async (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    setThreadsPerPage(nextValue);
    await client.widget.setProp('threads_per_page', nextValue);
  };

  return (
    <section style={SETTINGS_CONTAINER_STYLE}>
      <label style={LABEL_STYLE}>
        Forum title
        <input type="text" value={title} onChange={updateTitle} style={INPUT_STYLE} />
      </label>

      <label style={LABEL_STYLE}>
        New post button label
        <input type="text" value={newThreadLabel} onChange={updateNewThreadLabel} style={INPUT_STYLE} />
      </label>

      <label style={LABEL_STYLE}>
        About this community (optional)
        <textarea
          value={aboutText}
          onChange={updateAboutText}
          rows={3}
          maxLength={300}
          placeholder="A short welcome shown in the forum's side panel"
          style={{ ...INPUT_STYLE, resize: 'vertical' }}
        />
      </label>

      <div style={LABEL_STYLE}>
        Layout
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {([
            {
              value: 'full' as const,
              label: 'Full forum',
              hint: 'All posts, search and side panel',
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
              value: 'highlights' as const,
              label: 'Highlights',
              hint: 'Latest 3 posts, great for the home page',
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
          ]).map((opt) => {
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
                  border: selected ? '2px solid #2563EB' : '1px solid #d1d5db',
                  borderRadius: '10px',
                  padding: selected ? '7px' : '8px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {opt.preview}
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827' }}>{opt.label}</span>
                <span style={{ fontSize: '11px', fontWeight: 400, color: '#6b7280', lineHeight: 1.35 }}>{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label style={LABEL_STYLE}>
        Primary color
        <input type="color" value={color} onChange={updateColor} style={{ ...INPUT_STYLE, padding: '4px' }} />
      </label>

      <label style={LABEL_STYLE}>
        Who can post threads
        <select value={whoCanPostThreads} onChange={updateThreadAudience} style={INPUT_STYLE}>
          <option value="everyone">Everyone</option>
          <option value="members_only">Members only</option>
        </select>
      </label>

      <label style={LABEL_STYLE}>
        Who can post replies
        <select value={whoCanPostReplies} onChange={updateReplyAudience} style={INPUT_STYLE}>
          <option value="everyone">Everyone</option>
          <option value="members_only">Members only</option>
        </select>
      </label>

      <label style={LABEL_STYLE}>
        Threads per page
        <select value={threadsPerPage} onChange={updateThreadsPerPage} style={INPUT_STYLE}>
          {THREADS_PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>

      <label style={{ ...LABEL_STYLE, gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={membersCanDelete}
          onChange={updateMembersCanDelete}
        />
        Members can delete their own posts
      </label>
      <label style={{ ...LABEL_STYLE, gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={replyNotifications}
          onChange={updateReplyNotifications}
        />
        Let members get email notifications for replies to their posts (Pro)
      </label>
    </section>
  );
};

export default SettingsPanel;
