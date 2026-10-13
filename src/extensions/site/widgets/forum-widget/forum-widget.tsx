import React, { useCallback, useEffect, useRef, useState, type FC } from 'react';
import ReactDOM from 'react-dom';
import reactToWebComponent from 'react-to-webcomponent';
import { httpClient } from '@wix/essentials';
import { window as siteWindow } from '@wix/site-window';
import './style.css';

type Thread = {
  id: string;
  title: string;
  author: string;
  replies: number;
  timestamp: string;
  body: string;
  user_id: string | null;
  is_pinned: boolean;
  likeCount: number;
  likedByMe: boolean;
  edited: boolean;
  pending?: boolean;
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
  is_pinned: boolean | null;
  edited_at?: string | null;
  likeCount?: number;
  likedByMe?: boolean;
};

type Reply = {
  id: string;
  author: string;
  body: string;
  timestamp: string;
  user_id: string | null;
  likeCount: number;
  likedByMe: boolean;
  edited: boolean;
  pending?: boolean;
};

type ReplyRow = {
  id: string;
  body: string | null;
  author_name: string | null;
  user_name: string | null;
  user_id: string | null;
  created_at: string | null;
  edited_at?: string | null;
  likeCount?: number;
  likedByMe?: boolean;
};

type ForumWidgetProps = {
  title?: string;
  new_thread_label?: string;
  color?: string;
  who_can_post_threads?: string;
  who_can_post_replies?: string;
  members_can_delete?: boolean | string;
  threads_per_page?: number | string;
  reply_notifications?: boolean | string;
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

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const IconSvg: FC<{ size?: number; fill?: string; children: React.ReactNode }> = ({ size = 16, fill = 'none', children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ display: 'block', flexShrink: 0 }}
  >
    {children}
  </svg>
);

const HeartIcon: FC<{ filled?: boolean; size?: number }> = ({ filled = false, size = 16 }) => (
  <IconSvg size={size} fill={filled ? 'currentColor' : 'none'}>
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </IconSvg>
);

const PencilIcon: FC<{ size?: number }> = ({ size = 15 }) => (
  <IconSvg size={size}>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </IconSvg>
);

const TrashIcon: FC<{ size?: number }> = ({ size = 15 }) => (
  <IconSvg size={size}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </IconSvg>
);

const PinIcon: FC<{ size?: number }> = ({ size = 14 }) => (
  <IconSvg size={size}>
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </IconSvg>
);

const FORUM_CACHE_KEY = 'forumflow:v1:forum';
const FORUM_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedForum = {
  threads: ThreadRow[];
  subjectType: string | null;
  userId: string | null;
  staffUserIds: string[];
  savedAt: number;
};

const readForumCache = (): CachedForum | null => {
  try {
    const raw = window.localStorage.getItem(FORUM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedForum;
    if (!parsed || !Array.isArray(parsed.threads)) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > FORUM_CACHE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeForumCache = (data: Omit<CachedForum, 'savedAt'>): void => {
  try {
    window.localStorage.setItem(FORUM_CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    // storage unavailable; ignore
  }
};

const mapThreadRow = (thread: ThreadRow): Thread => ({
  id: thread.id,
  title: thread.title ?? 'Untitled thread',
  author: thread.user_name ?? thread.author_name ?? 'Unknown author',
  replies: thread.reply_count ?? 0,
  timestamp: formatTimestamp(thread.created_at),
  body: thread.body ?? '',
  user_id: thread.user_id ?? null,
  is_pinned: thread.is_pinned ?? false,
  likeCount: thread.likeCount ?? 0,
  likedByMe: thread.likedByMe ?? false,
  edited: !!thread.edited_at,
});

const LIKED_COLOR = '#e11d48';

const ForumWidget: FC<ForumWidgetProps> = ({
  title: forumTitle = 'Community',
  new_thread_label: newThreadLabel = 'New Post',
  color = '#2563EB',
  who_can_post_threads = 'everyone',
  who_can_post_replies = 'everyone',
  members_can_delete = true,
  threads_per_page = '10',
  reply_notifications = true,
}) => {
  const membersCanDelete = parseBooleanProp(members_can_delete, true);
  const replyNotificationsOn = parseBooleanProp(reply_notifications, true);
  const baseApiUrl = new URL(import.meta.url).origin;
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isEditorMode, setIsEditorMode] = useState(false);
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
  const [staffUserIds, setStaffUserIds] = useState<string[]>([]);
  const [isFree, setIsFree] = useState<boolean | null>(null);
  const [visitorName, setVisitorName] = useState('');
  const [isEditingThread, setIsEditingThread] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyBody, setEditReplyBody] = useState('');
  const [editReplyError, setEditReplyError] = useState<string | null>(null);
  const [isEditReplySaving, setIsEditReplySaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [replyMatchIds, setReplyMatchIds] = useState<Set<string>>(new Set());
  const [replyMatchQuery, setReplyMatchQuery] = useState('');

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setReplyMatchIds(new Set());
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      httpClient
        .fetchWithAuth(`${baseApiUrl}/api/forum?action=search_replies&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ threadIds?: string[] }>) : null))
        .then((data) => {
          if (!cancelled) {
            setReplyMatchIds(new Set(Array.isArray(data?.threadIds) ? data.threadIds : []));
            setReplyMatchQuery(q);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setReplyMatchIds(new Set());
            setReplyMatchQuery(q);
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, baseApiUrl]);
  const isSearchingReplies =
    searchQuery.trim().length >= 2 && replyMatchQuery !== searchQuery.trim();
  const [notifyEnabled, setNotifyEnabled] = useState<boolean | null>(null);
  const [notifySaving, setNotifySaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const expandedIdRef = useRef<string | null>(null);
  useEffect(() => {
    expandedIdRef.current = detailThread?.id ?? null;
  }, [detailThread?.id]);
  const repliesCacheRef = useRef<Record<string, Reply[]>>({});
  const prefetchingRef = useRef<Set<string>>(new Set());

  const confirmWrapStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
    fontSize: '13px',
    color: '#6b7280',
  };

  const confirmYesStyle: React.CSSProperties = {
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#dc2626',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600,
    padding: '3px 8px',
    cursor: 'pointer',
  };

  const confirmNoStyle: React.CSSProperties = {
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    color: '#374151',
    fontSize: '12px',
    fontWeight: 600,
    padding: '3px 8px',
    cursor: 'pointer',
  };
  const parsedPerPage = Number(threads_per_page);
  const THREADS_PER_PAGE =
    Number.isFinite(parsedPerPage) && parsedPerPage >= 1 && parsedPerPage <= 50
      ? Math.floor(parsedPerPage)
      : 10;
  const filteredThreads = threads.filter((t) => {
    const q = searchQuery.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q) || replyMatchIds.has(t.id);
  });
  const totalPages = Math.ceil(filteredThreads.length / THREADS_PER_PAGE);
  const paginatedThreads = filteredThreads.slice(
    (currentPage - 1) * THREADS_PER_PAGE,
    currentPage * THREADS_PER_PAGE
  );

  const identity = { subjectType, userId };

  const isStaff = (ownerUserId: string | null): boolean =>
    !!ownerUserId && staffUserIds.includes(ownerUserId);

  const staffBadge = (
    <span
      style={{
        display: 'inline-block',
        marginLeft: '6px',
        padding: '1px 6px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: '16px',
        color: '#ffffff',
        backgroundColor: color,
        verticalAlign: 'middle',
      }}
    >
      Team
    </span>
  );

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

  const canEditContent = (ownerUserId: string | null): boolean => {
    if (subjectType === 'APP') {
      return true;
    }
    return subjectType === 'MEMBER' && !!userId && ownerUserId === userId;
  };

  const mapReplyRow = (row: ReplyRow): Reply => ({
    id: row.id,
    author: row.user_name ?? row.author_name ?? 'Unknown author',
    body: row.body ?? '',
    timestamp: formatTimestamp(row.created_at),
    user_id: row.user_id ?? null,
    likeCount: row.likeCount ?? 0,
    likedByMe: row.likedByMe ?? false,
    edited: !!row.edited_at,
  });

  const fetchRepliesBulk = async (threadIds: string[]): Promise<Record<string, Reply[]> | null> => {
    try {
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=get_replies_bulk&thread_ids=${encodeURIComponent(threadIds.join(','))}`
      );
      if (!response.ok) return null;
      const data = (await response.json()) as Record<string, ReplyRow[]>;
      const mapped: Record<string, Reply[]> = {};
      for (const [threadId, rows] of Object.entries(data ?? {})) {
        mapped[threadId] = Array.isArray(rows) ? rows.map(mapReplyRow) : [];
      }
      return mapped;
    } catch {
      return null;
    }
  };

  const loadReplies = useCallback(async (threadId: string) => {
    const hasCache = !!repliesCacheRef.current[threadId];
    if (!hasCache) {
      setRepliesLoading(true);
      setRepliesError(null);
    }
    try {
      const result = await fetchRepliesBulk([threadId]);
      if (!result) {
        if (!hasCache && expandedIdRef.current === threadId) {
          setRepliesError('Could not load replies.');
          setReplies([]);
        }
        return;
      }
      const fresh = result[threadId] ?? [];
      repliesCacheRef.current[threadId] = fresh;
      if (expandedIdRef.current === threadId) {
        setReplies((prev) => [...fresh, ...prev.filter((r) => r.pending)]);
      }
    } finally {
      if (expandedIdRef.current === threadId) {
        setRepliesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let viewModeResolved = false;
    const cached = readForumCache();
    if (cached) {
      setSubjectType(cached.subjectType ?? null);
      setUserId(cached.userId ?? null);
      setStaffUserIds(Array.isArray(cached.staffUserIds) ? cached.staffUserIds : []);
      setThreads(cached.threads.map(mapThreadRow));
      setIsLoading(false);
    }
    const editorFallbackTimer = setTimeout(() => {
      if (!viewModeResolved && !cancelled && !cached) {
        setIsEditorMode(true);
        setIsLoading(false);
      }
    }, 3000);
    const loadAll = async () => {
      const tViewMode = performance.now();
      const viewMode = await siteWindow.viewMode();
      console.log('[ForumFlow] viewMode ms', Math.round(performance.now() - tViewMode));
      viewModeResolved = true;
      clearTimeout(editorFallbackTimer);
      if (cancelled) return;
      if (viewMode !== 'Site') {
        setIsEditorMode(true);
        setIsLoading(false);
        return;
      }

      setIsEditorMode(false);
      if (!cached) setIsLoading(true);
      setErrorMessage(null);
      try {
        httpClient
          .fetchWithAuth(`${baseApiUrl}/api/forum?action=get_plan`)
          .then((r) => (r.ok ? (r.json() as Promise<{ isFree?: boolean }>) : null))
          .then((planData) => {
            if (!cancelled) setIsFree(planData?.isFree ?? true);
          })
          .catch(() => {
            if (!cancelled) setIsFree(true);
          });
        httpClient
          .fetchWithAuth(`${baseApiUrl}/api/forum?action=get_notify_pref`)
          .then((r) => (r.ok ? (r.json() as Promise<{ eligible?: boolean; enabled?: boolean }>) : null))
          .then((pref) => {
            if (!cancelled && pref?.eligible) {
              setNotifyEnabled(pref.enabled ?? true);
            }
          })
          .catch(() => {});
        const response = await httpClient.fetchWithAuth(
          `${baseApiUrl}/api/forum?action=get_threads_with_identity`
        );
        if (cancelled) return;
        if (!response.ok) {
          if (!cached) {
            setErrorMessage('Could not load forum.');
            setThreads([]);
          }
          return;
        }
        const data = (await response.json()) as {
          threads: ThreadRow[];
          subjectType: string | null;
          userId: string | null;
          staffUserIds?: string[];
        };
        if (cancelled) return;
        setSubjectType(data.subjectType ?? null);
        setUserId(data.userId ?? null);
        setStaffUserIds(Array.isArray(data.staffUserIds) ? data.staffUserIds : []);
        setThreads(data.threads.map(mapThreadRow));
        writeForumCache({
          threads: data.threads,
          subjectType: data.subjectType ?? null,
          userId: data.userId ?? null,
          staffUserIds: Array.isArray(data.staffUserIds) ? data.staffUserIds : [],
        });
        setIsLoading(false);
      } catch {
        if (!cancelled && !cached) setErrorMessage('Could not load forum.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadAll();
    return () => { cancelled = true; clearTimeout(editorFallbackTimer); };
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

  const pageThreadKey = paginatedThreads
    .filter((t) => !t.pending)
    .map((t) => t.id)
    .join(',');

  useEffect(() => {
    if (isEditorMode || isLoading || !pageThreadKey) return;
    const timer = setTimeout(() => {
      const need: string[] = [];
      for (const t of paginatedThreads) {
        if (t.pending) continue;
        if (repliesCacheRef.current[t.id] || prefetchingRef.current.has(t.id)) continue;
        if (t.replies === 0) {
          repliesCacheRef.current[t.id] = [];
          continue;
        }
        need.push(t.id);
      }
      if (need.length === 0) return;
      need.forEach((id) => prefetchingRef.current.add(id));
      void fetchRepliesBulk(need)
        .then((result) => {
          if (!result) return;
          for (const id of need) {
            if (result[id] && !repliesCacheRef.current[id]) {
              repliesCacheRef.current[id] = result[id];
            }
          }
        })
        .finally(() => {
          need.forEach((id) => prefetchingRef.current.delete(id));
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [pageThreadKey, isEditorMode, isLoading]);

  const resetFormFields = () => {
    setTitle('');
    setBody('');
    setFormError(null);
  };

  const resetReplyForm = () => {
    setReplyBody('');
    setReplyFormError(null);
  };

  const saveExpandedToCache = () => {
    if (detailThread && !repliesLoading) {
      repliesCacheRef.current[detailThread.id] = replies.filter((r) => !r.pending);
    }
  };

  const handleOpenThreadDetail = (thread: Thread) => {
    if (thread.pending) return;
    saveExpandedToCache();
    const cached = repliesCacheRef.current[thread.id];
    setReplies(cached ?? []);
    setRepliesLoading(!cached);
    setRepliesError(null);
    setDetailThread(thread);
    setShowReplyForm(false);
    resetReplyForm();
    setIsEditingThread(false);
    setEditingReplyId(null);
    setEditError(null);
    setEditReplyError(null);
  };

  const handleBackToList = () => {
    saveExpandedToCache();
    setDetailThread(null);
    setShowReplyForm(false);
    resetReplyForm();
    setReplies([]);
    setRepliesError(null);
    setIsEditingThread(false);
    setEditingReplyId(null);
    setEditError(null);
    setEditReplyError(null);
  };

  const handleOpenNewThread = () => {
    handleBackToList();
    setFormError(null);
    setShowNewThreadForm(true);
  };

  const handleCancelNewThread = () => {
    setShowNewThreadForm(false);
    resetFormFields();
  };

  const handleSubmitNewThread = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("Title can't be empty.");
      return;
    }
    setFormError(null);

    const submittedTitle = title;
    const submittedBody = body;
    const tempId = `temp-${Date.now()}`;
    const tempThread: Thread = {
      id: tempId,
      title: trimmedTitle,
      author: subjectType === 'VISITOR' ? (visitorName.trim() || 'Guest') : 'You',
      replies: 0,
      timestamp: 'Just now',
      body: submittedBody.trim(),
      user_id: userId,
      is_pinned: false,
      likeCount: 0,
      likedByMe: false,
      edited: false,
      pending: true,
    };

    setThreads((prev) => {
      const pinned = prev.filter((t) => t.is_pinned);
      const rest = prev.filter((t) => !t.is_pinned);
      return [...pinned, tempThread, ...rest];
    });
    setSearchQuery('');
    setCurrentPage(1);
    setShowNewThreadForm(false);
    resetFormFields();
    setIsSubmitting(true);

    const restoreForm = (message: string) => {
      setThreads((prev) => prev.filter((t) => t.id !== tempId));
      setTitle(submittedTitle);
      setBody(submittedBody);
      setFormError(message);
      setShowNewThreadForm(true);
    };

    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_thread',
          title: submittedTitle,
          content: submittedBody,
          category_id: null,
          visitor_name: visitorName,
          who_can_post_threads,
          who_can_post_replies,
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          const errData = (await response.json().catch(() => ({}))) as { error?: string };
          if (errData.error === 'LIMIT_REACHED') {
            restoreForm(
              'This forum has reached its free plan limit. If you own this site, upgrade ForumFlow to Pro in your Wix dashboard.',
            );
            return;
          }
        }
        restoreForm(
          response.status === 401 ? 'You need to log in to create a thread.' : 'Could not create thread.',
        );
        return;
      }

      const created = (await response.json()) as ThreadRow;
      setThreads((prev) =>
        prev.map((t) =>
          t.id === tempId
            ? {
                id: created.id,
                title: created.title ?? trimmedTitle,
                author: created.user_name ?? created.author_name ?? tempThread.author,
                replies: created.reply_count ?? 0,
                timestamp: formatTimestamp(created.created_at),
                body: created.body ?? '',
                user_id: created.user_id ?? null,
                is_pinned: created.is_pinned ?? false,
                likeCount: 0,
                likedByMe: false,
                edited: false,
                pending: false,
              }
            : t,
        ),
      );
    } catch {
      restoreForm('Could not create thread.');
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

    const removedIndex = threads.findIndex((t) => t.id === threadId);
    if (removedIndex < 0) return;
    const removed = threads[removedIndex];

    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    if (detailThread?.id === threadId) {
      setDetailThread(null);
      setReplies([]);
    }

    const restore = () => {
      setThreads((prev) => {
        if (prev.some((t) => t.id === threadId)) return prev;
        const next = [...prev];
        next.splice(Math.min(removedIndex, next.length), 0, removed);
        return next;
      });
    };

    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_thread', thread_id: threadId }),
      });
      if (!response.ok) restore();
    } catch {
      restore();
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    const removedIndex = replies.findIndex((r) => r.id === replyId);
    if (removedIndex < 0) return;
    const removed = replies[removedIndex];
    const threadId = detailThread?.id ?? null;

    const adjustCount = (delta: number) => {
      if (!threadId) return;
      setDetailThread((prev) =>
        prev && prev.id === threadId ? { ...prev, replies: Math.max(0, prev.replies + delta) } : prev,
      );
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, replies: Math.max(0, t.replies + delta) } : t)),
      );
    };

    const restore = () => {
      setReplies((prev) => {
        if (prev.some((r) => r.id === replyId)) return prev;
        const next = [...prev];
        next.splice(Math.min(removedIndex, next.length), 0, removed);
        return next;
      });
      adjustCount(1);
    };

    setReplies((prev) => prev.filter((r) => r.id !== replyId));
    adjustCount(-1);

    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_reply', reply_id: replyId }),
      });
      if (!response.ok) restore();
    } catch {
      restore();
    }
  };

  const handleStartEditThread = () => {
    if (!detailThread) return;
    setEditTitle(detailThread.title);
    setEditBody(detailThread.body);
    setEditError(null);
    setIsEditingThread(true);
  };

  const handleSaveEditThread = async () => {
    if (!detailThread) return;
    if (!editTitle.trim()) {
      setEditError('Title cannot be empty.');
      return;
    }
    setEditError(null);

    const editedId = detailThread.id;
    const submittedTitle = editTitle;
    const submittedBody = editBody;
    const newTitle = submittedTitle.trim();
    const newBody = submittedBody.trim();
    const prevTitle = detailThread.title;
    const prevBody = detailThread.body;
    const prevEdited = detailThread.edited;

    setDetailThread((prev) =>
      prev && prev.id === editedId ? { ...prev, title: newTitle, body: newBody, edited: true } : prev,
    );
    setThreads((prev) =>
      prev.map((t) => (t.id === editedId ? { ...t, title: newTitle, body: newBody, edited: true } : t)),
    );
    setIsEditingThread(false);
    setIsEditSaving(true);

    const revert = () => {
      setDetailThread((prev) =>
        prev && prev.id === editedId ? { ...prev, title: prevTitle, body: prevBody, edited: prevEdited } : prev,
      );
      setThreads((prev) =>
        prev.map((t) => (t.id === editedId ? { ...t, title: prevTitle, body: prevBody, edited: prevEdited } : t)),
      );
      if (expandedIdRef.current === editedId) {
        setEditTitle(submittedTitle);
        setEditBody(submittedBody);
        setEditError('Could not save changes.');
        setIsEditingThread(true);
      }
    };

    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_thread',
          thread_id: editedId,
          title: submittedTitle,
          content: submittedBody,
        }),
      });
      if (!response.ok) revert();
    } catch {
      revert();
    } finally {
      setIsEditSaving(false);
    }
  };

  const handleStartEditReply = (reply: Reply) => {
    setEditingReplyId(reply.id);
    setEditReplyBody(reply.body);
    setEditReplyError(null);
  };

  const handleSaveEditReply = async () => {
    if (!editingReplyId) return;
    if (!editReplyBody.trim()) {
      setEditReplyError('Reply cannot be empty.');
      return;
    }
    setEditReplyError(null);

    const editedId = editingReplyId;
    const submittedBody = editReplyBody;
    const newBody = submittedBody.trim();
    const original = replies.find((r) => r.id === editedId);
    const prevBody = original?.body ?? '';
    const prevEdited = original?.edited ?? false;

    setReplies((prev) => prev.map((r) => (r.id === editedId ? { ...r, body: newBody, edited: true } : r)));
    setEditingReplyId(null);
    setIsEditReplySaving(true);

    const revert = () => {
      setReplies((prev) =>
        prev.map((r) => (r.id === editedId ? { ...r, body: prevBody, edited: prevEdited } : r)),
      );
      setEditReplyBody(submittedBody);
      setEditReplyError('Could not save changes.');
      setEditingReplyId(editedId);
    };

    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_reply',
          reply_id: editedId,
          content: submittedBody,
        }),
      });
      if (!response.ok) revert();
    } catch {
      revert();
    } finally {
      setIsEditReplySaving(false);
    }
  };

  const handleToggleLike = useCallback(async (threadId: string) => {
    if (subjectType !== 'MEMBER') return;

    // Optimistic update — update UI immediately
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? {
              ...t,
              likedByMe: !t.likedByMe,
              likeCount: !t.likedByMe ? t.likeCount + 1 : Math.max(0, t.likeCount - 1),
            }
          : t
      )
    );

    try {
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=toggle_like&thread_id=${encodeURIComponent(threadId)}`
      );
      if (!response.ok) {
        // Revert on failure
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  likedByMe: !t.likedByMe,
                  likeCount: !t.likedByMe ? t.likeCount + 1 : Math.max(0, t.likeCount - 1),
                }
              : t
          )
        );
      }
    } catch {
      // Revert on error
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                likedByMe: !t.likedByMe,
                likeCount: !t.likedByMe ? t.likeCount + 1 : Math.max(0, t.likeCount - 1),
              }
            : t
        )
      );
    }
  }, [baseApiUrl, subjectType]);

  const handleToggleReplyLike = useCallback(async (replyId: string) => {
    if (subjectType !== 'MEMBER') return;

    // Optimistic update
    setReplies((prev) =>
      prev.map((r) =>
        r.id === replyId
          ? {
              ...r,
              likedByMe: !r.likedByMe,
              likeCount: !r.likedByMe ? r.likeCount + 1 : Math.max(0, r.likeCount - 1),
            }
          : r
      )
    );

    try {
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=toggle_reply_like&reply_id=${encodeURIComponent(replyId)}`
      );
      if (!response.ok) {
        // Revert on failure
        setReplies((prev) =>
          prev.map((r) =>
            r.id === replyId
              ? {
                  ...r,
                  likedByMe: !r.likedByMe,
                  likeCount: !r.likedByMe ? r.likeCount + 1 : Math.max(0, r.likeCount - 1),
                }
              : r
          )
        );
      }
    } catch {
      // Revert on error
      setReplies((prev) =>
        prev.map((r) =>
          r.id === replyId
            ? {
                ...r,
                likedByMe: !r.likedByMe,
                likeCount: !r.likedByMe ? r.likeCount + 1 : Math.max(0, r.likeCount - 1),
              }
            : r
        )
      );
    }
  }, [baseApiUrl, subjectType]);

  const handleToggleNotify = async () => {
    if (notifyEnabled === null || notifySaving) return;
    const next = !notifyEnabled;
    setNotifyEnabled(next);
    setNotifySaving(true);
    try {
      const res = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=set_notify_pref&enabled=${next ? 'true' : 'false'}`
      );
      if (!res.ok) {
        setNotifyEnabled(!next);
      }
    } catch {
      setNotifyEnabled(!next);
    } finally {
      setNotifySaving(false);
    }
  };

  const handleSubmitReply = async () => {
    if (!detailThread) {
      return;
    }

    const trimmedReply = replyBody.trim();
    if (!trimmedReply) {
      setReplyFormError("Reply can't be empty.");
      return;
    }
    setReplyFormError(null);

    const threadId = detailThread.id;
    const submittedBody = replyBody;
    const tempId = `temp-${Date.now()}`;
    const tempReply: Reply = {
      id: tempId,
      author: subjectType === 'VISITOR' ? (visitorName.trim() || 'Guest') : 'You',
      body: trimmedReply,
      timestamp: 'Just now',
      user_id: userId,
      likeCount: 0,
      likedByMe: false,
      edited: false,
      pending: true,
    };

    setReplies((prev) => [...prev, tempReply]);
    setDetailThread((prev) => (prev ? { ...prev, replies: prev.replies + 1 } : null));
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, replies: t.replies + 1 } : t)),
    );
    setShowReplyForm(false);
    resetReplyForm();
    setIsReplySubmitting(true);

    const rollback = (message: string) => {
      setReplies((prev) => prev.filter((r) => r.id !== tempId));
      setDetailThread((prev) =>
        prev && prev.id === threadId ? { ...prev, replies: Math.max(0, prev.replies - 1) } : prev,
      );
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, replies: Math.max(0, t.replies - 1) } : t)),
      );
      setReplyBody(submittedBody);
      setReplyFormError(message);
      setShowReplyForm(true);
    };

    try {
      const response = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_reply',
          thread_id: threadId,
          content: submittedBody,
          visitor_name: visitorName,
          who_can_post_threads,
          who_can_post_replies,
          page_url: window.location.href,
          reply_notifications: replyNotificationsOn ? 'true' : 'false',
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          const errData = (await response.json().catch(() => ({}))) as { error?: string };
          if (errData.error === 'LIMIT_REACHED') {
            rollback(
              'This forum has reached its free plan limit. If you own this site, upgrade ForumFlow to Pro in your Wix dashboard.',
            );
            return;
          }
        }
        rollback(response.status === 401 ? 'You need to log in to post a reply.' : 'Could not post reply.');
        return;
      }

      const created = (await response.json()) as ReplyRow;
      setReplies((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? {
                id: created.id,
                author: created.user_name ?? created.author_name ?? tempReply.author,
                body: created.body ?? trimmedReply,
                timestamp: formatTimestamp(created.created_at),
                user_id: created.user_id ?? null,
                likeCount: 0,
                likedByMe: false,
                edited: false,
                pending: false,
              }
            : r,
        ),
      );
    } catch {
      rollback('Could not post reply.');
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

  const actionButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    border: 'none',
    background: 'none',
    padding: '2px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#6b7280',
    cursor: 'pointer',
    lineHeight: 1,
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
            disabled={showNewThreadForm}
            style={{
              border: 'none',
              borderRadius: '8px',
              backgroundColor:
                showNewThreadForm
                  ? `color-mix(in srgb, ${color} 50%, transparent)`
                  : color,
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              padding: '8px 12px',
              cursor: showNewThreadForm ? 'not-allowed' : 'pointer',
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
      ) : isEditorMode ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: '#6b7280', fontSize: '14px', lineHeight: 1.6 }}>
          <div style={{ margin: '0 0 8px', display: 'flex', justifyContent: 'center' }} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" />
              <path d="M8.5 10.5h7" />
              <path d="M8.5 13.5h4.5" />
            </svg>
          </div>
          <p style={{ margin: 0 }}>Your forum threads will appear on your live site.</p>
          <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#9ca3af' }}>
            Tip: drag this section anywhere on your page. Click Settings to customize the forum.
          </p>
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
        <>
          {subjectType === 'MEMBER' && replyNotificationsOn && isFree === false && (
            <label
              style={{
                visibility: notifyEnabled === null ? 'hidden' : 'visible',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: '#4b5563',
                marginBottom: '10px',
                cursor: notifySaving ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={notifyEnabled ?? true}
                disabled={notifySaving || notifyEnabled === null}
                onChange={() => void handleToggleNotify()}
                style={{ accentColor: color }}
              />
              Email me when someone replies to my posts
            </label>
          )}
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="Search posts…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                padding: '8px 32px 8px 10px',
                fontSize: '14px',
                fontFamily: 'inherit',
                color: '#111827',
              }}
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  color: '#9ca3af',
                  padding: '2px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '10px' }}>
          {paginatedThreads.length === 0 ? (
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
              {threads.length === 0 ? 'No posts yet.' : isSearchingReplies ? 'Searching…' : 'No posts match your search.'}
            </li>
          ) : (
            paginatedThreads.map((thread) => {
              const isExpanded = detailThread?.id === thread.id;
              return (
                <li
                  key={thread.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => (isExpanded ? handleBackToList() : handleOpenThreadDetail(thread))}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isExpanded) { handleBackToList(); } else { handleOpenThreadDetail(thread); }
                    }
                  }}
                  style={{
                    border: isExpanded ? `1px solid ${color}` : '1px solid #e5e7eb',
                    borderRadius: '10px',
                    padding: '12px',
                    backgroundColor: isExpanded ? '#ffffff' : '#f9fafb',
                    boxShadow: isExpanded ? '0 1px 6px rgba(0, 0, 0, 0.06)' : 'none',
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
                      {!(isExpanded && isEditingThread) ? (
                        <>
                          <p style={{ margin: '0 0 6px', fontSize: isExpanded ? '17px' : '15px', fontWeight: 600 }}>
                            {thread.is_pinned ? (
                              <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: '6px', color: color }}>
                                <PinIcon />
                              </span>
                            ) : null}
                            {thread.title}
                          </p>
                          {thread.body ? (
                            <p
                              style={{
                                margin: '0 0 6px',
                                fontSize: '14px',
                                lineHeight: 1.5,
                                color: '#374151',
                                display: isExpanded ? 'block' : '-webkit-box',
                                WebkitLineClamp: isExpanded ? 'unset' : 2,
                                WebkitBoxOrient: 'vertical' as const,
                                overflow: 'hidden',
                                wordBreak: 'break-word',
                                whiteSpace: isExpanded ? 'pre-wrap' : 'normal',
                              }}
                            >
                              {thread.body}
                            </p>
                          ) : null}
                        </>
                      ) : null}
                      <p style={{ margin: 0, fontSize: '13px', color: '#4b5563' }}>
                        {thread.author}{isStaff(thread.user_id) ? staffBadge : null} •{' '}
                        {thread.replies === 1 ? '1 reply' : `${thread.replies} replies`} •{' '}
                        {thread.timestamp}{thread.edited ? ' (edited)' : ''}
                      </p>
                      {(subjectType === 'MEMBER' || thread.likeCount > 0) && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '13px',
                            fontWeight: 600,
                            color: thread.likedByMe ? LIKED_COLOR : '#9ca3af',
                            cursor: subjectType === 'MEMBER' ? 'pointer' : 'default',
                            marginTop: '4px',
                            transition: 'transform 0.15s ease, color 0.15s ease',
                            transform: 'scale(1)',
                          }}
                          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(1.4)'; }}
                          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                          onClick={(e) => {
                            if (subjectType !== 'MEMBER') return;
                            e.stopPropagation();
                            void handleToggleLike(thread.id);
                          }}
                        >
                          <HeartIcon filled={thread.likedByMe} /> {thread.likeCount > 0 ? thread.likeCount : ''}
                        </span>
                      )}
                    </div>
                    {canDeleteContent(thread.user_id) ? (
                      confirmDeleteId === thread.id ? (
                        <span
                          style={confirmWrapStyle}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          Delete?
                          <button
                            type="button"
                            style={confirmYesStyle}
                            onClick={(e) => {
                              setConfirmDeleteId(null);
                              void handleDeleteThread(thread.id, e);
                            }}
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            style={confirmNoStyle}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          title="Delete post"
                          aria-label="Delete post"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(thread.id);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                          style={{ ...deleteButtonStyle, display: 'inline-flex' }}
                        >
                          <TrashIcon />
                        </button>
                      )
                    ) : null}
                  </div>
                  {isExpanded ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '1px solid #e5e7eb',
                        display: 'grid',
                        gap: '14px',
                        cursor: 'default',
                      }}
                    >
                      {isEditingThread ? (
                        <div style={{ display: 'grid', gap: '10px' }}>
                          <div>
                            <label style={fieldLabelStyle}>Title</label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              style={fieldInputStyle}
                            />
                          </div>
                          <div>
                            <label style={fieldLabelStyle}>Body</label>
                            <textarea
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              style={fieldTextareaStyle}
                            />
                          </div>
                          {editError ? (
                            <p style={{ margin: 0, fontSize: '14px', color: '#b91c1c' }}>{editError}</p>
                          ) : null}
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => void handleSaveEditThread()}
                              disabled={isEditSaving}
                              style={{
                                border: 'none',
                                borderRadius: '8px',
                                backgroundColor: color,
                                opacity: isEditSaving ? 0.6 : 1,
                                color: '#ffffff',
                                fontSize: '14px',
                                fontWeight: 600,
                                padding: '8px 14px',
                                cursor: isEditSaving ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {isEditSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setIsEditingThread(false); setEditError(null); }}
                              disabled={isEditSaving}
                              style={{
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                backgroundColor: '#ffffff',
                                color: '#374151',
                                fontSize: '14px',
                                fontWeight: 600,
                                padding: '8px 14px',
                                cursor: isEditSaving ? 'not-allowed' : 'pointer',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : canEditContent(thread.user_id) ? (
                        <button
                          type="button"
                          onClick={handleStartEditThread}
                          style={{
                            justifySelf: 'start',
                            border: 'none',
                            background: 'none',
                            padding: 0,
                            fontSize: '13px',
                            fontWeight: 600,
                            color: color,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <PencilIcon size={14} /> Edit
                        </button>
                      ) : null}
                      <div>
                        {repliesLoading ? (
                          <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginLeft: '16px', paddingLeft: 0, display: 'grid', gap: '10px' }}>
                            {[1, 2].map((i) => (
                              <li key={i} style={{ border: 'none', borderRadius: '12px', padding: '10px', backgroundColor: '#f3f4f6' }}>
                                <div className="forum-skeleton-bar" style={{ height: '12px', borderRadius: '6px', backgroundColor: '#e5e7eb', marginBottom: '8px', width: '30%' }} />
                                <div className="forum-skeleton-bar" style={{ height: '14px', borderRadius: '6px', backgroundColor: '#e5e7eb', width: `${60 + i * 15}%` }} />
                              </li>
                            ))}
                          </ul>
                        ) : repliesError ? (
                          <p style={{ margin: 0, fontSize: '14px', color: '#b91c1c' }}>{repliesError}</p>
                        ) : (
                          <ul
                            style={{
                              listStyle: 'none',
                              margin: 0,
                              padding: 0,
                              marginLeft: '16px',
                              paddingLeft: 0,
                              display: 'grid',
                              gap: '10px',
                            }}
                          >
                            {replies.length === 0 ? (
                              <li
                                style={{ border: 'none', backgroundColor: 'transparent', padding: '2px 0', fontSize: '13px', color: '#6b7280' }}
                              >
                                No replies yet.
                              </li>
                            ) : (
                              replies.map((reply) => (
                                <li key={reply.id} style={{ display: 'grid', gap: '4px', justifyItems: 'start' }}>
                                  {editingReplyId === reply.id ? (
                                    <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
                                      <textarea
                                        value={editReplyBody}
                                        onChange={(e) => setEditReplyBody(e.target.value)}
                                        style={fieldTextareaStyle}
                                      />
                                      {editReplyError ? (
                                        <p style={{ margin: 0, fontSize: '13px', color: '#b91c1c' }}>{editReplyError}</p>
                                      ) : null}
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                          type="button"
                                          onClick={() => void handleSaveEditReply()}
                                          disabled={isEditReplySaving}
                                          style={{
                                            border: 'none',
                                            borderRadius: '8px',
                                            backgroundColor: color,
                                            opacity: isEditReplySaving ? 0.6 : 1,
                                            color: '#ffffff',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            padding: '6px 12px',
                                            cursor: isEditReplySaving ? 'not-allowed' : 'pointer',
                                          }}
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => { setEditingReplyId(null); setEditReplyError(null); }}
                                          disabled={isEditReplySaving}
                                          style={{
                                            border: '1px solid #d1d5db',
                                            borderRadius: '8px',
                                            backgroundColor: '#ffffff',
                                            color: '#374151',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            padding: '6px 12px',
                                            cursor: isEditReplySaving ? 'not-allowed' : 'pointer',
                                          }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div
                                      style={{
                                        backgroundColor: '#f3f4f6',
                                        borderRadius: '14px',
                                        padding: '8px 12px',
                                        maxWidth: '100%',
                                        boxSizing: 'border-box',
                                        wordBreak: 'break-word',
                                      }}
                                    >
                                      <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                                        {reply.author}{isStaff(reply.user_id) ? staffBadge : null}
                                      </p>
                                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.45, color: '#111827', whiteSpace: 'pre-wrap' }}>
                                        {reply.body}
                                      </p>
                                    </div>
                                  )}
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      flexWrap: 'wrap',
                                      gap: '12px',
                                      paddingLeft: '12px',
                                      fontSize: '12px',
                                      color: '#6b7280',
                                    }}
                                  >
                                    <span>{reply.timestamp}{reply.edited ? ' · edited' : ''}</span>
                                    {(subjectType === 'MEMBER' || reply.likeCount > 0) ? (
                                      <button
                                        type="button"
                                        aria-label="Like reply"
                                        disabled={subjectType !== 'MEMBER'}
                                        onClick={() => { if (subjectType === 'MEMBER') void handleToggleReplyLike(reply.id); }}
                                        onMouseDown={(e) => { if (subjectType === 'MEMBER') e.currentTarget.style.transform = 'scale(1.3)'; }}
                                        onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                        style={{
                                          ...actionButtonStyle,
                                          color: reply.likedByMe ? LIKED_COLOR : '#6b7280',
                                          cursor: subjectType === 'MEMBER' ? 'pointer' : 'default',
                                          transition: 'transform 0.15s ease, color 0.15s ease',
                                        }}
                                      >
                                        <HeartIcon filled={reply.likedByMe} size={14} />
                                        {reply.likeCount > 0 ? <span>{reply.likeCount}</span> : null}
                                      </button>
                                    ) : null}
                                    {canEditContent(reply.user_id) && editingReplyId !== reply.id ? (
                                      <button
                                        type="button"
                                        title="Edit reply"
                                        aria-label="Edit reply"
                                        onClick={() => handleStartEditReply(reply)}
                                        style={actionButtonStyle}
                                      >
                                        <PencilIcon size={14} />
                                      </button>
                                    ) : null}
                                    {canDeleteContent(reply.user_id) ? (
                                      confirmDeleteId === reply.id ? (
                                        <span style={confirmWrapStyle}>
                                          Delete?
                                          <button
                                            type="button"
                                            style={confirmYesStyle}
                                            onClick={() => {
                                              setConfirmDeleteId(null);
                                              void handleDeleteReply(reply.id);
                                            }}
                                          >
                                            Yes
                                          </button>
                                          <button type="button" style={confirmNoStyle} onClick={() => setConfirmDeleteId(null)}>
                                            No
                                          </button>
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          title="Delete reply"
                                          aria-label="Delete reply"
                                          onClick={() => setConfirmDeleteId(reply.id)}
                                          style={actionButtonStyle}
                                        >
                                          <TrashIcon size={14} />
                                        </button>
                                      )
                                    ) : null}
                                  </div>
                                </li>
                              ))
                            )}
                          </ul>
                        )}
                      </div>
                      {repliesMembersOnlyBlock ? (
                        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Only members can reply.</p>
                      ) : (
                        <div style={{ display: 'grid', gap: '8px', marginLeft: '16px', paddingLeft: 0 }}>
                          {subjectType === 'VISITOR' ? visitorSignUpNudge : null}
                          {subjectType === 'VISITOR' ? (
                            <input
                              type="text"
                              placeholder="Your name"
                              value={visitorName}
                              onChange={(e) => setVisitorName(e.target.value)}
                              style={fieldInputStyle}
                            />
                          ) : null}
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                            <textarea
                              placeholder="Write a reply…"
                              value={replyBody}
                              onChange={(e) => setReplyBody(e.target.value)}
                              rows={1}
                              style={{
                                ...fieldInputStyle,
                                flex: 1,
                                minHeight: '40px',
                                resize: 'vertical',
                                borderRadius: '18px',
                                padding: '9px 14px',
                                backgroundColor: '#f3f4f6',
                                border: '1px solid transparent',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => void handleSubmitReply()}
                              disabled={!replyBody.trim()}
                              style={{
                                border: 'none',
                                borderRadius: '18px',
                                backgroundColor: color,
                                opacity: replyBody.trim() ? 1 : 0.5,
                                color: '#ffffff',
                                fontSize: '14px',
                                fontWeight: 600,
                                padding: '9px 16px',
                                cursor: replyBody.trim() ? 'pointer' : 'not-allowed',
                                flexShrink: 0,
                              }}
                            >
                              Reply
                            </button>
                          </div>
                          {replyFormError ? (
                            <p style={{ margin: 0, fontSize: '13px', color: '#b91c1c' }}>{replyFormError}</p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: currentPage === 1 ? '#9ca3af' : '#374151',
                fontSize: '14px',
                fontWeight: 600,
                padding: '6px 12px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              ←
            </button>
            <span style={{ fontSize: '13px', color: '#6b7280' }}>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: currentPage === totalPages ? '#9ca3af' : '#374151',
                fontSize: '14px',
                fontWeight: 600,
                padding: '6px 12px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              →
            </button>
          </div>
        )}
        </>
      )}
      {isFree === true && (
        <div style={{
          marginTop: '12px',
          paddingTop: '10px',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
          fontSize: '11px',
          color: '#9ca3af',
        }}>
          Powered by{' '}
          <a
            href="https://www.wix.com/app-market/forumflow"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#9ca3af', textDecoration: 'underline' }}
          >
            ForumFlow
          </a>
        </div>
      )}
    </section>
  );
};

const customElement = reactToWebComponent(
  ForumWidget,
  React,
  ReactDOM as any,
  {
    props: ['title', 'new_thread_label', 'color', 'who_can_post_threads', 'who_can_post_replies', 'members_can_delete', 'threads_per_page', 'reply_notifications'],
  }
);
export default customElement;
