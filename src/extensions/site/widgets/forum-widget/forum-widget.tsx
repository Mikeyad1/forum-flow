import React, { useCallback, useEffect, useState, type FC } from 'react';
import ReactDOM from 'react-dom';
import reactToWebComponent from 'react-to-webcomponent';
import { httpClient } from '@wix/essentials';
import './style.css';

type Thread = {
  id: string;
  title: string;
  author: string;
  replies: number;
  timestamp: string;
  body: string;
  user_id: string | null;
};

type ThreadRow = {
  id: string;
  title: string | null;
  body: string | null;
  author_name: string | null;
  user_name: string | null;
  user_id: string | null;
  reply_count: number | null;
  created_at: string | null;
};

type Reply = {
  id: string;
  author: string;
  body: string;
  timestamp: string;
  user_id: string | null;
};

type ReplyRow = {
  id: string;
  body: string | null;
  author_name: string | null;
  user_name: string | null;
  user_id: string | null;
  created_at: string | null;
};

type ForumWidgetProps = {
  title?: string;
  new_thread_label?: string;
  color?: string;
  who_can_post_threads?: string;
  who_can_post_replies?: string;
  members_can_delete?: boolean | string;
};

const parseBooleanProp = (value: boolean | string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return defaultValue;
};

const visitorSignUpNudge = (
  <div
    style={{
      padding: '8px 12px',
      marginBottom: '12px',
      backgroundColor: '#f5f5f5',
      borderRadius: '6px',
      fontSize: '13px',
      color: '#555',
    }}
  >
    💬 Posting as a guest. Sign in or create an account on this site to post as a member.
  </div>
);

const formatTimestamp = (rawTimestamp: string | null): string => {
  if (!rawTimestamp) {
    return 'Unknown time';
  }

  const parsed = new Date(rawTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown time';
  }

  return parsed.toLocaleString();
};

const ForumWidget: FC<ForumWidgetProps> = ({
  title: forumTitle = 'ForumFlow',
  new_thread_label: newThreadLabel = 'New Thread',
  color = '#2563EB',
  who_can_post_threads = 'everyone',
  who_can_post_replies = 'everyone',
  members_can_delete = true,
}) => {
  const membersCanDelete = parseBooleanProp(members_can_delete, true);
  const baseApiUrl = new URL(import.meta.url).origin;
  console.log('[ForumFlow] ForumWidget mounted');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showNewThreadForm, setShowNewThreadForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [detailThread, setDetailThread] = useState<Thread | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState<string | null>(null);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyFormError, setReplyFormError] = useState<string | null>(null);
  const [isReplySubmitting, setIsReplySubmitting] = useState(false);
  const [subjectType, setSubjectType] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [visitorName, setVisitorName] = useState('');

  const identity = { subjectType, userId };

  const threadsMembersOnlyBlock =
    who_can_post_threads === 'members_only' && subjectType === 'VISITOR';
  const repliesMembersOnlyBlock =
    who_can_post_replies === 'members_only' && subjectType === 'VISITOR';

  const canDeleteContent = (ownerUserId: string | null): boolean => {
    if (subjectType === 'APP') {
      return true;
    }
    if (!membersCanDelete) {
      return false;
    }
    return subjectType === 'MEMBER' && !!userId && ownerUserId === userId;
  };

  const loadThreads = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      console.log('[ForumFlow] loadThreads: about to call fetchWithAuth');
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=get_threads`
      );
      console.log('[ForumFlow] loadThreads: response received, status:', response.status);

      if (!response.ok) {
        setErrorMessage(
          response.status === 401
            ? 'You need to log in to view the forum.'
            : 'Could not load threads.',
        );
        setThreads([]);
        return;
      }

      const data = (await response.json()) as ThreadRow[];

      if (!Array.isArray(data)) {
        setErrorMessage('Could not load threads.');
        setThreads([]);
        return;
      }

      setThreads(
        data.map((thread: ThreadRow) => ({
          id: thread.id,
          title: thread.title ?? 'Untitled thread',
          author: thread.user_name ?? thread.author_name ?? 'Unknown author',
          replies: thread.reply_count ?? 0,
          timestamp: formatTimestamp(thread.created_at),
          body: thread.body ?? '',
          user_id: thread.user_id ?? null,
        }))
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadReplies = useCallback(async (threadId: string) => {
    setRepliesLoading(true);
    setRepliesError(null);

    try {
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=get_replies&thread_id=${encodeURIComponent(threadId)}`
      );

      if (!response.ok) {
        setRepliesError(
          response.status === 401
            ? 'You need to log in to view replies.'
            : 'Could not load replies.',
        );
        setReplies([]);
        return;
      }

      const data = (await response.json()) as ReplyRow[];

      if (!Array.isArray(data)) {
        setRepliesError('Could not load replies.');
        setReplies([]);
        return;
      }

      setReplies(
        data.map((row) => ({
          id: row.id,
          author: row.user_name ?? row.author_name ?? 'Unknown author',
          body: row.body ?? '',
          timestamp: formatTimestamp(row.created_at),
          user_id: row.user_id ?? null,
        }))
      );
    } finally {
      setRepliesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await httpClient.fetchWithAuth(
          `${baseApiUrl}/api/forum?action=get_threads_with_identity`
        );
        if (cancelled) return;
        if (!response.ok) {
          setErrorMessage('Could not load forum.');
          setThreads([]);
          return;
        }
        const data = (await response.json()) as {
          threads: ThreadRow[];
          subjectType: string | null;
          userId: string | null;
        };
        if (cancelled) return;
        setSubjectType(data.subjectType ?? null);
        setUserId(data.userId ?? null);
        setThreads(
          data.threads.map((thread: ThreadRow) => ({
            id: thread.id,
            title: thread.title ?? 'Untitled thread',
            author: thread.user_name ?? thread.author_name ?? 'Unknown author',
            replies: thread.reply_count ?? 0,
            timestamp: formatTimestamp(thread.created_at),
            body: thread.body ?? '',
            user_id: thread.user_id ?? null,
          }))
        );
      } catch {
        if (!cancelled) setErrorMessage('Could not load forum.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadAll();
    return () => { cancelled = true; };
  }, [baseApiUrl]);

  useEffect(() => {
    if (!detailThread) {
      setReplies([]);
      setRepliesError(null);
      setRepliesLoading(false);
      return;
    }
    void loadReplies(detailThread.id);
  }, [detailThread?.id, loadReplies]);

  const resetFormFields = () => {
    setTitle('');
    setBody('');
    setFormError(null);
  };

  const resetReplyForm = () => {
    setReplyBody('');
    setReplyFormError(null);
  };

  const handleOpenThreadDetail = (thread: Thread) => {
    setDetailThread(thread);
    setShowReplyForm(false);
    resetReplyForm();
  };

  const handleBackToList = () => {
    setDetailThread(null);
    setShowReplyForm(false);
    resetReplyForm();
    setReplies([]);
    setRepliesError(null);
  };

  const handleOpenNewThread = () => {
    setFormError(null);
    setShowNewThreadForm(true);
  };

  const handleCancelNewThread = () => {
    setShowNewThreadForm(false);
    resetFormFields();
  };

  const handleSubmitNewThread = async () => {
    setFormError(null);
    setIsSubmitting(true);

    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_thread',
          title,
          content: body,
          category_id: null,
          visitor_name: visitorName,
          who_can_post_threads,
          who_can_post_replies,
        }),
      });

      if (!response.ok) {
        setFormError(
          response.status === 401
            ? 'You need to log in to create a thread.'
            : 'Could not create thread.',
        );
        return;
      }

      setShowNewThreadForm(false);
      resetFormFields();
      await loadThreads();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenReplyForm = () => {
    setReplyFormError(null);
    setShowReplyForm(true);
  };

  const handleCancelReply = () => {
    setShowReplyForm(false);
    resetReplyForm();
  };

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_thread', thread_id: threadId }),
      });

      if (!response.ok) {
        return;
      }

      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (detailThread?.id === threadId) {
        setDetailThread(null);
        setReplies([]);
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_reply', reply_id: replyId }),
      });

      if (!response.ok) {
        return;
      }

      setReplies((prev) => prev.filter((r) => r.id !== replyId));
      if (detailThread) {
        setDetailThread((prev) =>
          prev
            ? { ...prev, replies: Math.max(0, (prev.replies ?? 1) - 1) }
            : null,
        );
        setThreads((prev) =>
          prev.map((t) =>
            t.id === detailThread.id
              ? { ...t, replies: Math.max(0, (t.replies ?? 1) - 1) }
              : t,
          ),
        );
      }
    } catch {
      // ignore
    }
  };

  const handleSubmitReply = async () => {
    if (!detailThread) {
      return;
    }

    setReplyFormError(null);
    setIsReplySubmitting(true);

    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_reply',
          thread_id: detailThread.id,
          content: replyBody,
          visitor_name: visitorName,
          who_can_post_threads,
          who_can_post_replies,
        }),
      });

      if (!response.ok) {
        setReplyFormError(
          response.status === 401
            ? 'You need to log in to post a reply.'
            : 'Could not post reply.',
        );
        return;
      }

      setShowReplyForm(false);
      resetReplyForm();
      await loadReplies(detailThread.id);

      setDetailThread((prev) =>
        prev ? { ...prev, replies: prev.replies + 1 } : null,
      );
      setThreads((prev) =>
        prev.map((t) =>
          t.id === detailThread.id ? { ...t, replies: t.replies + 1 } : t,
        ),
      );
    } finally {
      setIsReplySubmitting(false);
    }
  };

  const fieldLabelStyle = {
    display: 'block' as const,
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '4px',
    color: '#374151',
  };

  const fieldInputStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '14px',
    fontFamily: 'inherit',
    color: '#111827',
  };

  const fieldTextareaStyle = {
    ...fieldInputStyle,
    minHeight: '100px',
    resize: 'vertical' as const,
  };

  const deleteButtonStyle = {
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    fontSize: '14px',
    padding: '4px 6px',
    cursor: 'pointer' as const,
    flexShrink: 0,
  };

  return (
    <section
      data-who-can-post-threads={who_can_post_threads}
      data-who-can-post-replies={who_can_post_replies}
      style={{
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '16px',
        boxSizing: 'border-box',
        color: '#111827',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{forumTitle}</h2>
        {threadsMembersOnlyBlock ? (
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Members only</p>
        ) : (
          <button
            type="button"
            onClick={handleOpenNewThread}
            disabled={showNewThreadForm || detailThread !== null}
            style={{
              border: 'none',
              borderRadius: '8px',
              backgroundColor:
                showNewThreadForm || detailThread !== null
                  ? `color-mix(in srgb, ${color} 50%, transparent)`
                  : color,
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              padding: '8px 12px',
              cursor: showNewThreadForm || detailThread !== null ? 'not-allowed' : 'pointer',
            }}
          >
            {newThreadLabel}
          </button>
        )}
      </header>

      {showNewThreadForm ? (
        <div style={{ display: 'grid', gap: '12px' }}>
          {identity.subjectType === 'VISITOR' ? visitorSignUpNudge : null}
          {identity.subjectType === 'VISITOR' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Your name</label>
              <input
                type="text"
                placeholder="Enter your name"
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ccc',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          <div>
            <label htmlFor="forum-widget-title" style={fieldLabelStyle}>
              Title
            </label>
            <input
              id="forum-widget-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={fieldInputStyle}
            />
          </div>
          <div>
            <label htmlFor="forum-widget-body" style={fieldLabelStyle}>
              Body
            </label>
            <textarea
              id="forum-widget-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={fieldTextareaStyle}
            />
          </div>
          {formError ? (
            <p style={{ margin: 0, fontSize: '14px', color: '#b91c1c' }}>{formError}</p>
          ) : null}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handleSubmitNewThread()}
              disabled={isSubmitting}
              style={{
                border: 'none',
                borderRadius: '8px',
                backgroundColor: isSubmitting ? '#93c5fd' : color,
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                padding: '8px 14px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? 'Submitting…' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={handleCancelNewThread}
              disabled={isSubmitting}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: '14px',
                fontWeight: 600,
                padding: '8px 14px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : detailThread ? (
        <div style={{ display: 'grid', gap: '14px' }}>
          <button
            type="button"
            onClick={handleBackToList}
            style={{
              alignSelf: 'flex-start',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontSize: '14px',
              fontWeight: 600,
              padding: '8px 14px',
              cursor: 'pointer',
            }}
          >
            Back
          </button>

          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{detailThread.title}</h3>
          <p
            style={{
              margin: 0,
              fontSize: '14px',
              lineHeight: 1.5,
              color: '#374151',
              whiteSpace: 'pre-wrap',
            }}
          >
            {detailThread.body || '—'}
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
            {detailThread.author} • {detailThread.timestamp} • {detailThread.replies}{' '}
            {detailThread.replies === 1 ? 'reply' : 'replies'}
          </p>

          <div>
            <p style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 600, color: '#111827' }}>
              Replies
            </p>
            {repliesLoading ? (
              <p style={{ margin: 0, fontSize: '14px', color: '#4b5563' }}>Loading replies...</p>
            ) : repliesError ? (
              <p style={{ margin: 0, fontSize: '14px', color: '#b91c1c' }}>{repliesError}</p>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'grid',
                  gap: '8px',
                }}
              >
                {replies.length === 0 ? (
                  <li
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '10px',
                      backgroundColor: '#f9fafb',
                      fontSize: '14px',
                      color: '#4b5563',
                    }}
                  >
                    No replies yet.
                  </li>
                ) : (
                  replies.map((reply) => (
                    <li
                      key={reply.id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '10px',
                        backgroundColor: '#f9fafb',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '8px',
                          marginBottom: '4px',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                          {reply.author} • {reply.timestamp}
                        </p>
                        {canDeleteContent(reply.user_id) ? (
                          <button
                            type="button"
                            title="Delete reply"
                            aria-label="Delete reply"
                            onClick={() => void handleDeleteReply(reply.id)}
                            style={deleteButtonStyle}
                          >
                            🗑
                          </button>
                        ) : null}
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '14px',
                          color: '#111827',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {reply.body}
                      </p>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          {repliesMembersOnlyBlock ? (
            <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Members only</p>
          ) : !showReplyForm ? (
            <button
              type="button"
              onClick={handleOpenReplyForm}
              style={{
                alignSelf: 'flex-start',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: color,
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 600,
                padding: '8px 14px',
                cursor: 'pointer',
              }}
            >
              Reply
            </button>
          ) : (
            <>
              {identity.subjectType === 'VISITOR' ? visitorSignUpNudge : null}
              <div
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '12px',
                  backgroundColor: '#fafafa',
                  display: 'grid',
                  gap: '10px',
                }}
              >
              {identity.subjectType === 'VISITOR' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Your name</label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={visitorName}
                    onChange={(e) => setVisitorName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #ccc',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              )}
              <div>
                <label htmlFor="forum-widget-reply-body" style={fieldLabelStyle}>
                  Body
                </label>
                <textarea
                  id="forum-widget-reply-body"
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  style={fieldTextareaStyle}
                />
              </div>
              {replyFormError ? (
                <p style={{ margin: 0, fontSize: '14px', color: '#b91c1c' }}>{replyFormError}</p>
              ) : null}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => void handleSubmitReply()}
                  disabled={isReplySubmitting}
                  style={{
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: isReplySubmitting ? '#93c5fd' : color,
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 600,
                    padding: '8px 14px',
                    cursor: isReplySubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isReplySubmitting ? 'Submitting…' : 'Submit'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelReply}
                  disabled={isReplySubmitting}
                  style={{
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '14px',
                    fontWeight: 600,
                    padding: '8px 14px',
                    cursor: isReplySubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
            </>
          )}
        </div>
      ) : isLoading ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '10px' }}>
          {[1, 2, 3].map((i) => (
            <li
              key={i}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '12px',
                backgroundColor: '#f9fafb',
              }}
            >
              <div
                className="forum-skeleton-bar"
                style={{
                  height: '15px',
                  borderRadius: '6px',
                  backgroundColor: '#e5e7eb',
                  marginBottom: '10px',
                  width: `${70 + i * 8}%`,
                }}
              />
              <div
                className="forum-skeleton-bar"
                style={{
                  height: '12px',
                  borderRadius: '6px',
                  backgroundColor: '#e5e7eb',
                  width: '40%',
                }}
              />
            </li>
          ))}
        </ul>
      ) : errorMessage ? (
        <p style={{ margin: 0, fontSize: '14px', color: '#b91c1c' }}>{errorMessage}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '10px' }}>
          {threads.length === 0 ? (
            <li
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '12px',
                backgroundColor: '#f9fafb',
                fontSize: '14px',
                color: '#4b5563',
              }}
            >
              No threads yet.
            </li>
          ) : (
            threads.map((thread) => (
              <li
                key={thread.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenThreadDetail(thread)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenThreadDetail(thread);
                  }
                }}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  padding: '12px',
                  backgroundColor: '#f9fafb',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 600 }}>
                      {thread.title}
                    </p>
                    <p style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
                      {thread.author} •{' '}
                      {thread.replies === 1 ? '1 reply' : `${thread.replies} replies`} •{' '}
                      {thread.timestamp}
                    </p>
                  </div>
                  {canDeleteContent(thread.user_id) ? (
                    <button
                      type="button"
                      title="Delete thread"
                      aria-label="Delete thread"
                      onClick={(e) => void handleDeleteThread(thread.id, e)}
                      style={deleteButtonStyle}
                    >
                      🗑
                    </button>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
};

const customElement = reactToWebComponent(
  ForumWidget,
  React,
  ReactDOM as any,
  {
    props: ['title', 'new_thread_label', 'color', 'who_can_post_threads', 'who_can_post_replies', 'members_can_delete'],
  }
);
customElements.define('forum-widget', customElement);
export default customElement;
