import React, { useEffect, useMemo, useState, type ChangeEvent, type FC } from 'react';
import { editor, widget } from '@wix/editor';
import { createClient } from '@wix/sdk';

type PostingAudience = 'members_only' | 'everyone';

const DEFAULT_TITLE = 'ForumFlow';
const DEFAULT_NEW_THREAD_LABEL = 'New Thread';
const DEFAULT_COLOR = '#2563EB';
const DEFAULT_THREADS_AUDIENCE: PostingAudience = 'everyone';
const DEFAULT_REPLIES_AUDIENCE: PostingAudience = 'everyone';
const DEFAULT_MEMBERS_CAN_DELETE = true;

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
      ] = await Promise.all([
        client.widget.getProp('title'),
        client.widget.getProp('new_thread_label'),
        client.widget.getProp('color'),
        client.widget.getProp('who_can_post_threads'),
        client.widget.getProp('who_can_post_replies'),
        client.widget.getProp('members_can_delete'),
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

  return (
    <section style={SETTINGS_CONTAINER_STYLE}>
      <label style={LABEL_STYLE}>
        Forum title
        <input type="text" value={title} onChange={updateTitle} style={INPUT_STYLE} />
      </label>

      <label style={LABEL_STYLE}>
        New thread button label
        <input type="text" value={newThreadLabel} onChange={updateNewThreadLabel} style={INPUT_STYLE} />
      </label>

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

      <label style={{ ...LABEL_STYLE, gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={membersCanDelete}
          onChange={updateMembersCanDelete}
        />
        Members can delete their own posts
      </label>
    </section>
  );
};

export default SettingsPanel;
