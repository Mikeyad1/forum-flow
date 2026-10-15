import { useCallback, useEffect, useRef, useState, type CSSProperties, type FC, type ReactNode } from 'react';
import { Loader, WixDesignSystemProvider } from '@wix/design-system';
import { appInstances } from '@wix/app-management';
import { httpClient } from '@wix/essentials';
import '@wix/design-system/styles.global.css';

const APP_ID = 'ae9501ff-1e53-4cc5-83ff-36b974e644b1';
const FONT = 'Madefor, "Helvetica Neue", Helvetica, Arial, sans-serif';
const INK = '#16191f';
const BODY = '#3b4450';
const MUTED = '#5b6472';
const FAINT = '#7a8391';
const LINE = '#eceff3';
const LINE_SOFT = '#f0f2f5';
const SOFT = '#f3f5f8';
const ACCENT = '#116DFF';
const ACCENT_SOFT = '#e8f0ff';
const UP = '#15803d';
const DOWN = '#b91c1c';
const WARN = '#c2410c';
const WARN_TEXT = '#9a3412';
const FREE_POSTS = 25;
const FREE_REPLIES = 50;
const PAGE_SIZE = 20;
const UNDO_MS = 5000;
const WEEKLY_VIEWS_MIN = 50;
const DELTA_BASE_MIN = 5;
const CHART_MIN_DAYS = 14;
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const baseApiUrl = new URL(import.meta.env.BASE_API_URL || '', location.href).origin;

type DashThread = {
  id: string;
  title: string | null;
  body: string | null;
  user_id: string | null;
  user_name: string | null;
  author_name: string | null;
  is_pinned: boolean | null;
  reply_count: number | null;
  created_at: string | null;
  likeCount: number;
  views: number;
  is_example: boolean;
};

type Stats = {
  posts_total: number;
  posts_week: number;
  posts_prev_week: number;
  replies_total: number;
  replies_week: number;
  replies_prev_week: number;
  likes_total: number;
  likes_week: number;
  likes_prev_week: number;
  new_faces_week: number;
  activity_30d: number;
  replied_threads_30d: number;
  median_first_reply_minutes: number | null;
  busiest_dow: number | null;
  busiest_part: string | null;
  top_contributor_name: string | null;
  top_contributor_replies: number;
  tracking_since: string | null;
  views_all_time: number;
  people_all_time: number;
  views_week: number;
  views_prev_week: number;
  people_week: number;
  daily_views: { day: string; views: number }[];
  top_posts_week: { thread_id: string; views: number }[];
};

type ReplyRow = {
  id: string;
  body: string | null;
  user_id: string | null;
  user_name: string | null;
  author_name: string | null;
  created_at: string | null;
};

type AuthorRow = { user_id: string; user_name: string; is_staff: boolean };
type Tab = 'overview' | 'posts';
type Filter = 'all' | 'waiting' | 'pinned';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const toStats = (raw: Record<string, unknown>): Stats => ({
  posts_total: num(raw.posts_total),
  posts_week: num(raw.posts_week),
  posts_prev_week: num(raw.posts_prev_week),
  replies_total: num(raw.replies_total),
  replies_week: num(raw.replies_week),
  replies_prev_week: num(raw.replies_prev_week),
  likes_total: num(raw.likes_total),
  likes_week: num(raw.likes_week),
  likes_prev_week: num(raw.likes_prev_week),
  new_faces_week: num(raw.new_faces_week),
  activity_30d: num(raw.activity_30d),
  replied_threads_30d: num(raw.replied_threads_30d),
  median_first_reply_minutes: raw.median_first_reply_minutes == null ? null : num(raw.median_first_reply_minutes),
  busiest_dow: raw.busiest_dow == null ? null : num(raw.busiest_dow),
  busiest_part: typeof raw.busiest_part === 'string' ? raw.busiest_part : null,
  top_contributor_name: typeof raw.top_contributor_name === 'string' ? raw.top_contributor_name : null,
  top_contributor_replies: num(raw.top_contributor_replies),
  tracking_since: typeof raw.tracking_since === 'string' ? raw.tracking_since : null,
  views_all_time: num(raw.views_all_time),
  people_all_time: num(raw.people_all_time),
  views_week: num(raw.views_week),
  views_prev_week: num(raw.views_prev_week),
  people_week: num(raw.people_week),
  daily_views: Array.isArray(raw.daily_views)
    ? (raw.daily_views as { day: unknown; views: unknown }[]).map((d) => ({ day: String(d.day), views: num(d.views) }))
    : [],
  top_posts_week: Array.isArray(raw.top_posts_week)
    ? (raw.top_posts_week as { thread_id: unknown; views: unknown }[]).map((p) => ({
        thread_id: String(p.thread_id),
        views: num(p.views),
      }))
    : [],
});

const api = async <T,>(query: string): Promise<T | null> => {
  try {
    const res = await httpClient.fetchWithAuth(`${baseApiUrl}/api/forum?${query}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

const fmt = (n: number): string => n.toLocaleString('en-US');
const plural = (n: number, one: string, many: string): string => `${fmt(n)} ${n === 1 ? one : many}`;
const authorOf = (row: { user_name: string | null; author_name: string | null }): string =>
  row.user_name ?? row.author_name ?? 'Unknown';

const formatRelative = (raw: string | null | undefined): string => {
  if (!raw) return '';
  const time = new Date(raw).getTime();
  if (Number.isNaN(time)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'Yesterday' : `${days} days ago`;
  return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const shortDate = (ms: number): string => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const formatReplyTime = (minutes: number): string => {
  if (minutes < 60) return 'under an hour';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'about an hour' : `about ${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'about a day' : `about ${days} days`;
};

const smallDelta = (cur: number, prev: number): { text: string; color: string } | null => {
  if (prev < DELTA_BASE_MIN) return null;
  const diff = cur - prev;
  if (diff === 0) return null;
  return { text: diff > 0 ? `+${fmt(diff)}` : `−${fmt(Math.abs(diff))}`, color: diff > 0 ? UP : DOWN };
};

const Icon: FC<{ size?: number; strokeWidth?: number; children: ReactNode }> = ({ size = 16, strokeWidth = 2, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ display: 'block', flexShrink: 0 }}
  >
    {children}
  </svg>
);

const PIN = (
  <>
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </>
);
const TRASH = (
  <>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </>
);
const CHEVRON_DOWN = <path d="m6 9 6 6 6-6" />;
const ARROW_UP = <path d="M12 19V5M5 12l7-7 7 7" />;
const ARROW_DOWN = <path d="M12 5v14M19 12l-7 7-7-7" />;
const SEARCH = (
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
);
const CHECK = <path d="M20 6 9 17l-5-5" />;
const STAR = <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" />;
const USERS = <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" />;
const CLOCK = <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2" />;
const CALENDAR = <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />;
const CLOSE = (
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>
);

const ICON_BUTTON: CSSProperties = {
  width: '36px',
  height: '36px',
  borderRadius: '10px',
  border: 'none',
  background: 'transparent',
  color: FAINT,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
};

const OUTLINE_BUTTON: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: '36px',
  padding: '0 14px',
  borderRadius: '999px',
  border: '1px solid #e0e4ea',
  background: '#ffffff',
  color: INK,
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const H2: CSSProperties = { margin: 0, fontSize: '16px', fontWeight: 600, color: INK };
const BIG: CSSProperties = { fontSize: '64px', fontWeight: 600, lineHeight: 1, letterSpacing: '-0.02em', color: INK };
const MID: CSSProperties = { fontSize: '30px', fontWeight: 600, lineHeight: 1.1, color: INK };

const Chart: FC<{ values: number[] }> = ({ values }) => {
  const W = 860;
  const H = 140;
  const top = 12;
  const max = Math.max(1, ...values) * 1.08;
  const pts = values.map((v, i) => [
    values.length === 1 ? W : Math.round((i / (values.length - 1)) * W),
    Math.round(H - (v / max) * (H - top)),
  ]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox="0 0 860 150" width="100%" role="img" aria-label="Forum views per day" style={{ display: 'block', marginTop: '8px' }}>
      <line x1="0" y1="140" x2="860" y2="140" stroke={LINE} strokeWidth="1" />
      <path d={area} fill={ACCENT} fillOpacity="0.07" />
      <path d={line} fill="none" stroke={ACCENT} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      {last ? <circle cx={last[0]} cy={last[1]} r="4.5" fill={ACCENT} stroke="#ffffff" strokeWidth="2" /> : null}
    </svg>
  );
};

const DashboardPage: FC = () => {
  const [plan, setPlan] = useState<'loading' | 'free' | 'pro'>('loading');
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [threads, setThreads] = useState<DashThread[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [forumIsLive, setForumIsLive] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [replyMatchIds, setReplyMatchIds] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamPick, setTeamPick] = useState('');
  const [teamBusyId, setTeamBusyId] = useState<string | null>(null);
  const openIdRef = useRef<string | null>(null);
  const repliesCacheRef = useRef<Map<string, ReplyRow[]>>(new Map());
  const prefetchingRef = useRef<Set<string>>(new Set());
  const deletedReplyIdsRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<{
    reply: ReplyRow;
    index: number;
    threadId: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const isPro = plan === 'pro';

  const loadDashboard = useCallback(async () => {
    setLoadState('loading');
    let tz = 'UTC';
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      tz = 'UTC';
    }
    const data = await api<{ threads: DashThread[]; stats: Record<string, unknown>; forumIsLive: boolean }>(
      `action=get_dashboard&tz=${encodeURIComponent(tz)}`,
    );
    if (!data || !Array.isArray(data.threads) || !data.stats) {
      setLoadState('error');
      return;
    }
    setThreads(data.threads.map((t) => ({ ...t, likeCount: num(t.likeCount), views: num(t.views) })));
    setStats(toStats(data.stats));
    setForumIsLive(!!data.forumIsLive);
    setLoadState('ready');
  }, []);

  const loadAuthors = useCallback(async () => {
    const data = await api<AuthorRow[]>('action=admin_list_authors');
    setAuthors(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      let isFree = true;
      try {
        const response = await appInstances.getAppInstance();
        isFree = response.instance?.isFree ?? true;
        if (!cancelled) setInstanceId(response.instance?.instanceId ?? null);
      } catch {
        isFree = true;
      }
      if (cancelled) return;
      setPlan(isFree ? 'free' : 'pro');
      void loadDashboard();
      if (!isFree) void loadAuthors();
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [loadDashboard, loadAuthors]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setReplyMatchIds(new Set());
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<{ threadIds?: string[] }>(`action=search_replies&q=${encodeURIComponent(q)}`).then((data) => {
        if (!cancelled) setReplyMatchIds(new Set(Array.isArray(data?.threadIds) ? data?.threadIds : []));
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const commitPendingReply = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    setUndoVisible(false);
    void api<{ success: boolean }>(`action=admin_delete_reply&reply_id=${encodeURIComponent(pending.reply.id)}`).then(
      (res) => {
        if (!res) return;
        setThreads((prev) =>
          prev.map((t) =>
            t.id === pending.threadId ? { ...t, reply_count: Math.max(0, (t.reply_count ?? 0) - 1) } : t,
          ),
        );
      },
    );
  }, []);

  useEffect(() => () => commitPendingReply(), [commitPendingReply]);

  // Keep the replies cache in sync with what the open post shows (deletes, undo)
  useEffect(() => {
    if (openId && !repliesLoading) repliesCacheRef.current.set(openId, replies);
  }, [openId, replies, repliesLoading]);

  // Prefetch replies for the visible posts so they open instantly
  useEffect(() => {
    if (tab !== 'posts' || loadState !== 'ready') return;
    for (const t of threads) {
      if ((t.reply_count ?? 0) === 0 && !repliesCacheRef.current.has(t.id)) repliesCacheRef.current.set(t.id, []);
    }
    const need = threads
      .slice(0, visibleCount)
      .filter(
        (t) =>
          (t.reply_count ?? 0) > 0 && !repliesCacheRef.current.has(t.id) && !prefetchingRef.current.has(t.id),
      )
      .map((t) => t.id)
      .slice(0, 50);
    if (need.length === 0) return;
    need.forEach((id) => prefetchingRef.current.add(id));
    void api<Record<string, ReplyRow[]>>(
      `action=get_replies_bulk&thread_ids=${encodeURIComponent(need.join(','))}`,
    ).then((data) => {
      need.forEach((id) => prefetchingRef.current.delete(id));
      if (!data) return;
      for (const id of need) {
        const rows = data[id];
        if (Array.isArray(rows) && !repliesCacheRef.current.has(id)) {
          repliesCacheRef.current.set(
            id,
            rows.filter((r) => !deletedReplyIdsRef.current.has(r.id)),
          );
        }
      }
    });
  }, [tab, loadState, threads, visibleCount]);

  const closePost = useCallback(() => {
    commitPendingReply();
    openIdRef.current = null;
    setOpenId(null);
    setConfirmDelete(false);
  }, [commitPendingReply]);

  const togglePost = useCallback(
    async (threadId: string) => {
      if (openIdRef.current === threadId) {
        closePost();
        return;
      }
      commitPendingReply();
      openIdRef.current = threadId;
      setOpenId(threadId);
      setConfirmDelete(false);
      const cached = repliesCacheRef.current.get(threadId);
      setReplies(cached ?? []);
      setRepliesLoading(!cached);
      const data = await api<ReplyRow[]>(`action=get_replies&thread_id=${encodeURIComponent(threadId)}`);
      if (openIdRef.current !== threadId) return;
      if (Array.isArray(data)) {
        const fresh = data.filter((r) => !deletedReplyIdsRef.current.has(r.id));
        repliesCacheRef.current.set(threadId, fresh);
        setReplies(fresh);
      } else if (!cached) {
        setReplies([]);
      }
      setRepliesLoading(false);
    },
    [closePost, commitPendingReply],
  );

  const deleteReply = (reply: ReplyRow) => {
    const threadId = openIdRef.current;
    if (!threadId || !isPro) return;
    commitPendingReply();
    const index = replies.findIndex((r) => r.id === reply.id);
    deletedReplyIdsRef.current.add(reply.id);
    setReplies((prev) => prev.filter((r) => r.id !== reply.id));
    const timer = setTimeout(() => commitPendingReply(), UNDO_MS);
    pendingRef.current = { reply, index, threadId, timer };
    setUndoVisible(true);
  };

  const undoDeleteReply = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    setUndoVisible(false);
    deletedReplyIdsRef.current.delete(pending.reply.id);
    if (openIdRef.current === pending.threadId) {
      setReplies((prev) => {
        const next = [...prev];
        next.splice(Math.min(Math.max(pending.index, 0), next.length), 0, pending.reply);
        return next;
      });
    }
  };

  const togglePin = async (thread: DashThread) => {
    if (!isPro || busyId) return;
    const next = !thread.is_pinned;
    setBusyId(thread.id);
    const res = await api<{ success: boolean }>(
      `action=admin_pin_thread&thread_id=${encodeURIComponent(thread.id)}&pin=${next ? 'true' : 'false'}`,
    );
    if (res) setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, is_pinned: next } : t)));
    setBusyId(null);
  };

  const deleteThread = async (thread: DashThread) => {
    if (!isPro || busyId) return;
    commitPendingReply();
    setBusyId(thread.id);
    const res = await api<{ success: boolean }>(`action=admin_delete_thread&thread_id=${encodeURIComponent(thread.id)}`);
    setBusyId(null);
    if (!res) return;
    setThreads((prev) => prev.filter((t) => t.id !== thread.id));
    closePost();
  };

  const removeExample = async (thread: DashThread) => {
    if (busyId) return;
    setBusyId(thread.id);
    const res = await api<{ success: boolean }>(`action=owner_remove_example&thread_id=${encodeURIComponent(thread.id)}`);
    setBusyId(null);
    if (!res) return;
    setThreads((prev) => prev.filter((t) => t.id !== thread.id));
    if (openIdRef.current === thread.id) closePost();
  };

  const setStaff = async (userId: string, staff: boolean) => {
    if (!isPro || teamBusyId) return;
    setTeamBusyId(userId);
    const res = await api<{ success: boolean }>(
      `action=admin_set_staff&user_id=${encodeURIComponent(userId)}&staff=${staff ? 'true' : 'false'}`,
    );
    if (res) setAuthors((prev) => prev.map((a) => (a.user_id === userId ? { ...a, is_staff: staff } : a)));
    setTeamBusyId(null);
    if (staff) setTeamPick('');
  };

  const goToWaiting = () => {
    setTab('posts');
    setFilter('waiting');
    setSearch('');
    setVisibleCount(PAGE_SIZE);
  };

  const upgradeUrl = `https://www.wix.com/apps/upgrade/${APP_ID}${instanceId ? `?appInstanceId=${instanceId}` : ''}`;
  const staffIds = new Set(authors.filter((a) => a.is_staff).map((a) => a.user_id));
  const staffList = authors.filter((a) => a.is_staff);
  const teamCandidates = authors.filter((a) => !a.is_staff);
  const realThreads = threads.filter((t) => !t.is_example);
  const waitingThreads = realThreads.filter((t) => (t.reply_count ?? 0) === 0);

  const renderHeader = (meta: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, letterSpacing: '-0.01em', color: INK }}>Your community</h1>
        <span style={{ fontSize: '13px', color: MUTED }}>{meta}</span>
      </div>
      <div role="tablist" aria-label="Sections" style={{ display: 'flex', gap: '28px', borderBottom: `1px solid ${LINE}` }}>
        {([
          { id: 'overview' as const, label: 'Overview' },
          { id: 'posts' as const, label: 'Posts' },
        ]).map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(t.id)}
              style={{
                padding: '0 0 12px',
                marginBottom: '-1px',
                border: 'none',
                borderBottom: selected ? `2px solid ${INK}` : '2px solid transparent',
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: '15px',
                fontWeight: selected ? 600 : 500,
                color: selected ? INK : MUTED,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderOverview = (s: Stats) => {
    const weeklyMode = s.views_week >= WEEKLY_VIEWS_MIN || s.views_prev_week >= WEEKLY_VIEWS_MIN;
    const heroPct =
      s.views_prev_week >= WEEKLY_VIEWS_MIN
        ? Math.round(((s.views_week - s.views_prev_week) / s.views_prev_week) * 100)
        : null;
    const trackingMs = s.tracking_since ? Date.parse(s.tracking_since) : NaN;
    const hasTracking = Number.isFinite(trackingMs);
    const trackingDays = hasTracking ? (Date.now() - trackingMs) / 86400000 : 0;
    const showChart = trackingDays >= CHART_MIN_DAYS && s.views_all_time >= WEEKLY_VIEWS_MIN;
    const trackingDay = hasTracking ? new Date(trackingMs).toISOString().slice(0, 10) : '';
    const chartValues = s.daily_views.filter((d) => !trackingDay || d.day >= trackingDay).map((d) => d.views);

    const passed = MILESTONES.filter((m) => s.posts_total - s.posts_week < m && s.posts_total >= m).pop();
    const milestone = passed
      ? `Your forum just passed ${fmt(passed)} posts`
      : s.replies_total > 0 && s.replies_total === s.replies_week && s.replies_week <= 3
        ? 'Your first replies arrived this week'
        : null;

    const steps = [
      {
        title: 'Put the forum on your site',
        text: 'In the Editor: Add (+) › App Widgets › ForumFlow, then publish.',
        done: forumIsLive,
      },
      {
        title: 'Write the first post yourself',
        text: 'Ask your customers a question. People reply much more often than they start a topic.',
        done: s.posts_total > 0,
      },
      {
        title: 'Get your first reply',
        text: 'Share your forum page in your next newsletter, on Instagram or after checkout.',
        done: s.replies_total > 0,
      },
    ];
    const stepsDone = steps.filter((st) => st.done).length;
    const nextStep = steps.findIndex((st) => !st.done);

    const insights: { icon: ReactNode; text: string }[] = [];
    if (s.new_faces_week > 0 && s.posts_total >= 3) {
      insights.push({
        icon: USERS,
        text: `${s.new_faces_week === 1 ? '1 person' : `${fmt(s.new_faces_week)} people`} posted for the first time this week.`,
      });
    }
    if (s.replied_threads_30d >= 5 && s.median_first_reply_minutes != null) {
      insights.push({ icon: CLOCK, text: `Questions get a first reply in ${formatReplyTime(s.median_first_reply_minutes)}.` });
    }
    if (s.activity_30d >= 20 && s.busiest_dow != null && s.busiest_part) {
      insights.push({
        icon: CALENDAR,
        text: `Your members are most active on ${DAY_NAMES[s.busiest_dow] ?? ''} ${s.busiest_part}s.`,
      });
    }
    if (s.top_contributor_name && s.top_contributor_replies >= 3) {
      insights.push({
        icon: STAR,
        text: `${s.top_contributor_name} wrote ${fmt(s.top_contributor_replies)} replies this week, more than anyone.`,
      });
    }

    const topPosts = s.top_posts_week
      .map((p) => {
        const t = threads.find((x) => x.id === p.thread_id);
        return t ? { thread: t, views: p.views } : null;
      })
      .filter((x): x is { thread: DashThread; views: number } => !!x);

    const kpis = weeklyMode
      ? [
          { label: 'New posts', value: s.posts_week, delta: smallDelta(s.posts_week, s.posts_prev_week) },
          { label: 'Replies', value: s.replies_week, delta: smallDelta(s.replies_week, s.replies_prev_week) },
          { label: 'Likes', value: s.likes_week, delta: smallDelta(s.likes_week, s.likes_prev_week) },
        ]
      : [
          { label: 'Posts', value: s.posts_total, delta: null },
          { label: 'Replies', value: s.replies_total, delta: null },
          { label: 'Likes', value: s.likes_total, delta: null },
        ];
    const showKpis = kpis.some((k) => k.value > 0);

    const postsPct = s.posts_total / FREE_POSTS;
    const repliesPct = s.replies_total / FREE_REPLIES;
    const tight =
      postsPct >= repliesPct
        ? { used: s.posts_total, limit: FREE_POSTS, noun: 'posts', pct: postsPct }
        : { used: s.replies_total, limit: FREE_REPLIES, noun: 'replies', pct: repliesPct };
    const nearLimit = tight.pct >= 0.8;

    return (
      <>
        {renderHeader(weeklyMode ? 'Last 7 days' : 'Since you installed ForumFlow')}

        {s.people_all_time > 0 ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {milestone ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignSelf: 'flex-start',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: INK,
                  background: '#f4f1ea',
                  borderRadius: '999px',
                  padding: '6px 12px',
                }}
              >
                <span style={{ color: '#b7791f', display: 'flex' }}>
                  <Icon size={14}>{STAR}</Icon>
                </span>
                {milestone}
              </span>
            ) : null}
            {weeklyMode ? (
              <>
                <span style={{ fontSize: '14px', color: MUTED }}>Forum views</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap' }}>
                  <strong style={BIG}>{fmt(s.views_week)}</strong>
                  {heroPct != null && heroPct !== 0 ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '15px',
                        fontWeight: 600,
                        color: heroPct > 0 ? UP : DOWN,
                      }}
                    >
                      <Icon size={14} strokeWidth={2.5}>
                        {heroPct > 0 ? ARROW_UP : ARROW_DOWN}
                      </Icon>
                      {Math.abs(heroPct)}% vs last week
                    </span>
                  ) : null}
                  <span style={{ fontSize: '15px', color: MUTED }}>
                    by <strong style={{ color: INK, fontWeight: 600 }}>{plural(s.people_week, 'person', 'people')}</strong>
                  </span>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: '14px', color: MUTED }}>People who have seen your forum</span>
                <strong style={BIG}>{fmt(s.people_all_time)}</strong>
              </>
            )}
            {showChart ? (
              <>
                <Chart values={chartValues} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: FAINT }}>
                  <span>{trackingDays >= 30 ? '30 days ago' : `${shortDate(trackingMs)} · tracking started`}</span>
                  <span>Today</span>
                </div>
              </>
            ) : hasTracking ? (
              <span style={{ fontSize: '14px', color: MUTED }}>
                Your weekly chart starts filling in on {shortDate(trackingMs + CHART_MIN_DAYS * 86400000)}.
              </span>
            ) : null}
          </section>
        ) : null}

        {showKpis ? (
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              borderTop: `1px solid ${LINE}`,
              borderBottom: `1px solid ${LINE}`,
            }}
          >
            {kpis.map((k, i) => (
              <div
                key={k.label}
                style={{
                  padding: i === 0 ? '22px 24px 22px 0' : '22px 24px',
                  borderLeft: i === 0 ? 'none' : `1px solid ${LINE}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '13px', color: MUTED }}>{k.label}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                  <strong style={MID}>{fmt(k.value)}</strong>
                  {k.delta ? (
                    <span style={{ fontSize: '13px', fontWeight: 600, color: k.delta.color }}>{k.delta.text}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {stepsDone < steps.length ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <h2 style={H2}>Get your forum going</h2>
              <span style={{ fontSize: '13px', color: MUTED }}>{stepsDone} of 3 done</span>
            </div>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
              {steps.map((st, i) => (
                <li
                  key={st.title}
                  style={{
                    display: 'flex',
                    gap: '14px',
                    alignItems: i === nextStep ? 'flex-start' : 'center',
                    padding: '14px 0',
                    borderTop: `1px solid ${LINE_SOFT}`,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: st.done ? INK : 'transparent',
                      color: st.done ? '#ffffff' : BODY,
                      boxShadow: st.done ? 'none' : 'inset 0 0 0 1.5px #c9d1db',
                    }}
                  >
                    {st.done ? (
                      <Icon size={13} strokeWidth={3}>
                        {CHECK}
                      </Icon>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: st.done ? 400 : 600,
                        color: st.done ? FAINT : INK,
                        textDecoration: st.done ? 'line-through' : 'none',
                      }}
                    >
                      {st.title}
                    </span>
                    {i === nextStep ? (
                      <span style={{ fontSize: '14px', lineHeight: 1.5, color: MUTED }}>{st.text}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {insights.length > 0 ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={H2}>This week in your community</h2>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '14px 40px',
              }}
            >
              {insights.map((ins) => (
                <li key={ins.text} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: SOFT,
                      color: BODY,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon>{ins.icon}</Icon>
                  </span>
                  <span style={{ fontSize: '14px', lineHeight: 1.5, color: BODY, paddingTop: '5px' }}>{ins.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {weeklyMode && topPosts.length >= 3 ? (
          <section style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h2 style={H2}>Most read this week</h2>
              <button
                type="button"
                onClick={() => setTab('posts')}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: ACCENT,
                  cursor: 'pointer',
                }}
              >
                All posts
              </button>
            </div>
            {topPosts.map((p, i) => (
              <div
                key={p.thread.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px minmax(0, 1fr) auto',
                  gap: '14px',
                  alignItems: 'center',
                  padding: '12px 0',
                  borderTop: `1px solid ${LINE_SOFT}`,
                }}
              >
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#9aa3ae' }}>{i + 1}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: INK,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {p.thread.title ?? 'Untitled'}
                  </span>
                  <span style={{ fontSize: '13px', color: MUTED }}>
                    {authorOf(p.thread)} · {plural(p.thread.reply_count ?? 0, 'reply', 'replies')}
                  </span>
                </div>
                <span style={{ fontSize: '14px', color: BODY }}>
                  <strong style={{ fontWeight: 600 }}>{fmt(p.views)}</strong> {p.views === 1 ? 'view' : 'views'}
                </span>
              </div>
            ))}
          </section>
        ) : null}

        {waitingThreads.length > 0 ? (
          <button
            type="button"
            onClick={goToWaiting}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              padding: '16px 18px',
              borderRadius: '12px',
              border: 'none',
              background: '#fff6ee',
              fontFamily: 'inherit',
              textAlign: 'left',
              color: INK,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '14px' }}>
              <strong style={{ fontWeight: 600 }}>
                {waitingThreads.length === 1
                  ? '1 post is waiting for a reply.'
                  : `${fmt(waitingThreads.length)} posts are waiting for a reply.`}
              </strong>{' '}
              <span style={{ color: MUTED }}>A quick answer keeps members coming back.</span>
            </span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: WARN_TEXT, flexShrink: 0 }}>See posts</span>
          </button>
        ) : null}

        {!isPro ? (
          nearLimit ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '20px',
                paddingTop: '18px',
                borderTop: `1px solid ${LINE}`,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 280px', maxWidth: '420px' }}>
                <span style={{ fontSize: '14px', color: BODY }}>
                  <strong style={{ fontWeight: 600, color: INK }}>
                    {fmt(tight.used)} of {tight.limit} {tight.noun}
                  </strong>{' '}
                  on the free plan.{' '}
                  <span style={{ color: WARN_TEXT, fontWeight: 600 }}>
                    {tight.used >= tight.limit ? 'Limit reached.' : `${fmt(tight.limit - tight.used)} left.`}
                  </span>
                </span>
                <div style={{ height: '4px', borderRadius: '999px', background: LINE, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.round(tight.pct * 100))}%`,
                      borderRadius: '999px',
                      background: WARN,
                    }}
                  />
                </div>
              </div>
              <a
                href={upgradeUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '40px',
                  padding: '0 18px',
                  borderRadius: '999px',
                  background: INK,
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Keep it growing with Pro
              </a>
            </div>
          ) : (
            <p style={{ margin: 0, paddingTop: '18px', borderTop: `1px solid ${LINE}`, fontSize: '13px', color: MUTED }}>
              Free plan · {fmt(s.posts_total)} of {FREE_POSTS} posts used.{' '}
              <a
                href={upgradeUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}
              >
                See what Pro adds
              </a>
            </p>
          )
        ) : null}
      </>
    );
  };

  const renderPostRow = (t: DashThread) => {
    const expanded = openId === t.id;
    const replyCount = t.reply_count ?? 0;
    const meta = t.is_example
      ? 'Example post added by ForumFlow'
      : [
          authorOf(t),
          formatRelative(t.created_at),
          plural(replyCount, 'reply', 'replies'),
          plural(t.likeCount, 'like', 'likes'),
          plural(t.views, 'view', 'views'),
        ].join(' · ');
    return (
      <div key={t.id} style={{ borderTop: `1px solid ${LINE_SOFT}` }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: '16px',
            alignItems: 'center',
            padding: '16px 0',
          }}
        >
          <button
            type="button"
            onClick={() => void togglePost(t.id)}
            aria-expanded={expanded}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              padding: 0,
              textAlign: 'left',
              fontFamily: 'inherit',
              color: INK,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600, maxWidth: '100%' }}>
              {t.is_pinned ? (
                <span style={{ display: 'flex', color: ACCENT }} title="Pinned">
                  <Icon size={14}>{PIN}</Icon>
                </span>
              ) : null}
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title ?? 'Untitled'}</span>
              {t.is_example ? (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: '11px',
                    fontWeight: 600,
                    color: MUTED,
                    background: SOFT,
                    borderRadius: '999px',
                    padding: '2px 8px',
                  }}
                >
                  Example
                </span>
              ) : null}
            </span>
            <span style={{ fontSize: '13px', color: MUTED }}>
              {meta}
              {!t.is_example && replyCount === 0 ? (
                <span style={{ color: WARN_TEXT, fontWeight: 600 }}> · Waiting for a reply</span>
              ) : null}
            </span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {t.is_example ? (
              <button type="button" onClick={() => void removeExample(t)} disabled={busyId === t.id} style={OUTLINE_BUTTON}>
                {busyId === t.id ? 'Removing…' : 'Remove'}
              </button>
            ) : isPro ? (
              <button
                type="button"
                onClick={() => void togglePin(t)}
                disabled={busyId === t.id}
                aria-label={t.is_pinned ? 'Unpin' : 'Pin to top'}
                title={t.is_pinned ? 'Unpin' : 'Pin to top'}
                style={{
                  ...ICON_BUTTON,
                  background: t.is_pinned ? ACCENT_SOFT : 'transparent',
                  color: t.is_pinned ? ACCENT : FAINT,
                }}
              >
                <Icon>{PIN}</Icon>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void togglePost(t.id)}
              aria-label={expanded ? 'Collapse post' : 'Open post'}
              style={ICON_BUTTON}
            >
              <span style={{ display: 'flex', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
                <Icon>{CHEVRON_DOWN}</Icon>
              </span>
            </button>
          </div>
        </div>
        {expanded ? (
          <div style={{ padding: '0 0 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {t.body ? (
              <p
                style={{
                  margin: 0,
                  fontSize: '14px',
                  lineHeight: 1.65,
                  color: BODY,
                  maxWidth: '680px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {t.body}
              </p>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '16px', borderLeft: `2px solid ${LINE}` }}>
              {repliesLoading ? (
                <div style={{ padding: '8px 0' }}>
                  <Loader size="tiny" />
                </div>
              ) : replies.length === 0 ? (
                <span style={{ fontSize: '13px', color: MUTED }}>
                  No replies yet. Answer on your site to get the conversation going.
                </span>
              ) : (
                replies.map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: INK,
                          flexWrap: 'wrap',
                        }}
                      >
                        {authorOf(r)}
                        {r.user_id && staffIds.has(r.user_id) ? (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#ffffff',
                              background: ACCENT,
                              borderRadius: '999px',
                              padding: '1px 6px',
                            }}
                          >
                            Team
                          </span>
                        ) : null}
                        <span style={{ fontWeight: 400, color: FAINT }}>· {formatRelative(r.created_at)}</span>
                      </span>
                      <span style={{ fontSize: '14px', lineHeight: 1.55, color: BODY, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {r.body ?? ''}
                      </span>
                    </div>
                    {isPro ? (
                      <button
                        type="button"
                        onClick={() => deleteReply(r)}
                        aria-label="Delete reply"
                        title="Delete reply"
                        style={{ ...ICON_BUTTON, width: '32px', height: '32px' }}
                      >
                        <Icon size={14}>{TRASH}</Icon>
                      </button>
                    ) : null}
                  </div>
                ))
              )}
              {undoVisible ? (
                <div
                  role="status"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    background: INK,
                    color: '#ffffff',
                    fontSize: '14px',
                    maxWidth: '360px',
                  }}
                >
                  <span>Reply deleted</span>
                  <button
                    type="button"
                    onClick={undoDeleteReply}
                    style={{
                      minHeight: '30px',
                      padding: '0 10px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'transparent',
                      color: '#8fb8ff',
                      fontFamily: 'inherit',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Undo
                  </button>
                </div>
              ) : null}
            </div>
            {t.is_example ? null : isPro ? (
              confirmDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: DOWN }}>
                    Delete this post and its {plural(replyCount, 'reply', 'replies')}? This can't be undone.
                  </span>
                  <button
                    type="button"
                    onClick={() => void deleteThread(t)}
                    disabled={busyId === t.id}
                    style={{ ...OUTLINE_BUTTON, border: 'none', background: '#dc2626', color: '#ffffff' }}
                  >
                    {busyId === t.id ? 'Deleting…' : 'Delete'}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} style={OUTLINE_BUTTON}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setConfirmDelete(true)} style={{ ...OUTLINE_BUTTON, color: DOWN }}>
                    Delete post
                  </button>
                </div>
              )
            ) : (
              <span style={{ fontSize: '13px', color: MUTED }}>
                Pin and remove posts with Pro.{' '}
                <a
                  href={upgradeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: ACCENT, fontWeight: 600, textDecoration: 'none' }}
                >
                  See Pro
                </a>
              </span>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderPosts = () => {
    const q = search.trim().toLowerCase();
    const filtered = threads.filter((t) => {
      if (filter === 'pinned' && !t.is_pinned) return false;
      if (filter === 'waiting' && (t.is_example || (t.reply_count ?? 0) > 0)) return false;
      if (!q) return true;
      return (
        (t.title ?? '').toLowerCase().includes(q) ||
        (t.body ?? '').toLowerCase().includes(q) ||
        replyMatchIds.has(t.id)
      );
    });
    const visible = filtered.slice(0, visibleCount);
    return (
      <>
        {renderHeader(plural(realThreads.length, 'post', 'posts'))}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <label style={{ position: 'relative', flex: '1 1 240px', maxWidth: '340px' }}>
            <span
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: FAINT,
                display: 'flex',
              }}
            >
              <Icon>{SEARCH}</Icon>
            </span>
            <input
              type="search"
              placeholder="Search posts and replies"
              aria-label="Search posts and replies"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                minHeight: '40px',
                border: 'none',
                borderRadius: '10px',
                background: SOFT,
                padding: '0 12px 0 38px',
                fontFamily: 'inherit',
                fontSize: '14px',
                color: INK,
              }}
            />
          </label>
          <div role="group" aria-label="Show" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {([
              { id: 'all' as const, label: 'All' },
              { id: 'waiting' as const, label: 'Waiting for a reply' },
              { id: 'pinned' as const, label: 'Pinned' },
            ]).map((f) => {
              const selected = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setFilter(f.id);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  style={{
                    minHeight: '36px',
                    padding: '0 14px',
                    borderRadius: '999px',
                    border: 'none',
                    background: selected ? INK : SOFT,
                    color: selected ? '#ffffff' : BODY,
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visible.length === 0 ? (
            <p style={{ margin: 0, padding: '24px 0', borderTop: `1px solid ${LINE_SOFT}`, fontSize: '14px', color: MUTED }}>
              {threads.length === 0
                ? 'No posts yet.'
                : filter === 'waiting' && !q
                  ? 'All caught up. Every post has a reply.'
                  : 'No posts match.'}
            </p>
          ) : (
            visible.map(renderPostRow)
          )}
          {filtered.length > visibleCount ? (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              style={{
                marginTop: '8px',
                alignSelf: 'center',
                minHeight: '40px',
                padding: '0 18px',
                borderRadius: '999px',
                border: 'none',
                background: SOFT,
                color: INK,
                fontFamily: 'inherit',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Show more
            </button>
          ) : null}
        </div>
        {isPro ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '20px', borderTop: `1px solid ${LINE}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: INK }}>Team</span>
                <span style={{ fontSize: '14px', color: MUTED }}>
                  {staffList.length > 0
                    ? staffList.map((a) => a.user_name).join(', ')
                    : 'Give your staff a Team badge in the forum'}
                </span>
              </div>
              <button type="button" onClick={() => setTeamOpen((v) => !v)} aria-expanded={teamOpen} style={OUTLINE_BUTTON}>
                {teamOpen ? 'Done' : 'Manage team'}
              </button>
            </div>
            {teamOpen ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {staffList.map((a) => (
                  <div key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '420px' }}>
                    <span style={{ flex: 1, fontSize: '14px', color: INK }}>{a.user_name}</span>
                    <button
                      type="button"
                      onClick={() => void setStaff(a.user_id, false)}
                      disabled={teamBusyId === a.user_id}
                      aria-label={`Remove ${a.user_name} from team`}
                      title="Remove from team"
                      style={{ ...ICON_BUTTON, width: '32px', height: '32px' }}
                    >
                      <Icon size={14}>{CLOSE}</Icon>
                    </button>
                  </div>
                ))}
                {teamCandidates.length > 0 ? (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', maxWidth: '420px' }}>
                    <select
                      aria-label="Choose a member to add to your team"
                      value={teamPick}
                      onChange={(e) => setTeamPick(e.target.value)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: '36px',
                        border: '1px solid #e0e4ea',
                        borderRadius: '10px',
                        padding: '0 10px',
                        fontFamily: 'inherit',
                        fontSize: '14px',
                        color: INK,
                        background: '#ffffff',
                      }}
                    >
                      <option value="">Add a team member…</option>
                      {teamCandidates.map((a) => (
                        <option key={a.user_id} value={a.user_id}>
                          {a.user_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => teamPick && void setStaff(teamPick, true)}
                      disabled={!teamPick || !!teamBusyId}
                      style={{ ...OUTLINE_BUTTON, opacity: teamPick ? 1 : 0.5, cursor: teamPick ? 'pointer' : 'not-allowed' }}
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: '13px', color: MUTED }}>Members who post in the forum show up here.</span>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </>
    );
  };

  const isLoading = plan === 'loading' || loadState === 'loading';

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <div
        style={{
          minHeight: '100vh',
          background: '#ffffff',
          fontFamily: FONT,
          color: INK,
          display: 'flex',
          justifyContent: 'center',
          padding: '40px 32px 56px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: '100%', maxWidth: '860px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
              <Loader size="medium" />
            </div>
          ) : loadState === 'error' || !stats ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '24px 0' }}>
              <span style={{ fontSize: '14px', color: MUTED }}>We couldn't load your forum right now.</span>
              <button type="button" onClick={() => void loadDashboard()} style={OUTLINE_BUTTON}>
                Try again
              </button>
            </div>
          ) : tab === 'overview' ? (
            renderOverview(stats)
          ) : (
            renderPosts()
          )}
          {!isLoading ? (
            <p style={{ margin: 0, fontSize: '12px', color: FAINT, textAlign: 'center' }}>
              ForumFlow by Brivano Labs ·{' '}
              <a href="mailto:cloudslash3@gmail.com?subject=ForumFlow" style={{ color: MUTED }}>
                Contact support
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
