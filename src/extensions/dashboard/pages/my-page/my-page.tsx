import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import {
  Button,
  Card,
  Loader,
  Page,
  Table,
  TableToolbar,
  Text,
  WixDesignSystemProvider,
} from '@wix/design-system';
import { appInstances } from '@wix/app-management';
import { httpClient } from '@wix/essentials';
import '@wix/design-system/styles.global.css';

type ThreadRow = {
  id: string;
  title: string | null;
  user_name: string | null;
  author_name: string | null;
  created_at: string | null;
  is_pinned: boolean;
  reply_count: number | null;
};

type ReplyRow = {
  id: string;
  body: string | null;
  user_name: string | null;
  author_name: string | null;
  created_at: string | null;
};

const baseApiUrl = new URL(import.meta.env.BASE_API_URL || '', location.href).origin;

const jsonHeaders = { 'Content-Type': 'application/json' };

const formatDate = (raw: string | null): string => {
  if (!raw) {
    return '—';
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }
  return parsed.toLocaleString();
};

const getRepliesButtonLabel = (
  row: ThreadRow,
  likeCounts: Record<string, number>,
  isExpanded: boolean,
): string => {
  if (isExpanded) {
    return 'Hide';
  }
  const likes = likeCounts[row.id] ?? 0;
  const base = `View Replies (${row.reply_count ?? 0})`;
  return likes > 0 ? `${base} · ❤️ ${likes}` : base;
};

const DashboardPage: FC = () => {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [isFree, setIsFree] = useState(true);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const THREADS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);

  const loadThreads = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=get_threads`,
        { headers: jsonHeaders },
      );

      if (!response.ok) {
        setErrorMessage('Could not load threads.');
        setThreads([]);
        setIsLoading(false);
        return;
      }

      const data = (await response.json()) as ThreadRow[];
      const threadData = Array.isArray(data) ? data : [];
      setThreads(threadData);

      const likesResults = await Promise.all(
        threadData.map((t: ThreadRow) =>
          httpClient.fetchWithAuth(
            `${baseApiUrl}/api/forum?action=get_likes&thread_id=${encodeURIComponent(t.id)}`,
            { headers: jsonHeaders }
          )
          .then((r) => r.ok ? r.json() as Promise<{ likeCount: number }> : { likeCount: 0 })
          .catch(() => ({ likeCount: 0 }))
        )
      );

      const countsMap: Record<string, number> = {};
      threadData.forEach((t: ThreadRow, i: number) => {
        countsMap[t.id] = likesResults[i]?.likeCount ?? 0;
      });
      setLikeCounts(countsMap);
    } catch {
      setErrorMessage('Could not load threads.');
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadReplies = useCallback(async (threadId: string) => {
    setRepliesLoading(true);
    try {
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=get_replies&thread_id=${encodeURIComponent(threadId)}`,
        { headers: jsonHeaders },
      );
      const data = (await response.json()) as ReplyRow[];
      setReplies(Array.isArray(data) ? data : []);
    } finally {
      setRepliesLoading(false);
    }
  }, []);

  useEffect(() => {
    const checkPlan = async () => {
      try {
        const response = await appInstances.getAppInstance();
        const freeStatus = response.instance?.isFree ?? true;
        const fetchedInstanceId = response.instance?.instanceId ?? null;
        setInstanceId(fetchedInstanceId);
        setIsFree(freeStatus);
        if (!freeStatus) {
          void loadThreads();
        }
      } catch {
        setIsFree(true);
      } finally {
        setIsPlanLoading(false);
      }
    };
    void checkPlan();
  }, [loadThreads]);

  const handleDelete = useCallback(async (threadId: string) => {
    setDeletingId(threadId);

    try {
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=admin_delete_thread&thread_id=${encodeURIComponent(threadId)}`,
        { headers: jsonHeaders },
      );

      if (!response.ok) {
        return;
      }

      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    } finally {
      setDeletingId(null);
    }
  }, []);

  const handlePin = useCallback(async (threadId: string, currentlyPinned: boolean) => {
    setPinningId(threadId);
    try {
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=admin_pin_thread&thread_id=${encodeURIComponent(threadId)}&pin=${currentlyPinned ? 'false' : 'true'}`,
        { headers: jsonHeaders },
      );
      if (response.ok) {
        setThreads((prev) =>
          prev.map((t) =>
            t.id === threadId ? { ...t, is_pinned: !currentlyPinned } : t
          )
        );
      }
    } finally {
      setPinningId(null);
    }
  }, []);

  const handleDeleteReply = useCallback(async (replyId: string) => {
    setDeletingReplyId(replyId);
    try {
      const response = await httpClient.fetchWithAuth(
        `${baseApiUrl}/api/forum?action=admin_delete_reply&reply_id=${encodeURIComponent(replyId)}`,
        { headers: jsonHeaders },
      );
      if (response.ok) {
        setReplies((prev) => prev.filter((r) => r.id !== replyId));
      }
    } finally {
      setDeletingReplyId(null);
    }
  }, []);

  const filteredThreads = threads.filter((t) =>
    (t.title ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.ceil(filteredThreads.length / THREADS_PER_PAGE);
  const paginatedThreads = filteredThreads.slice(
    (currentPage - 1) * THREADS_PER_PAGE,
    currentPage * THREADS_PER_PAGE
  );

  const columns = useMemo(
    () => [
      {
        title: 'Title',
        render: (row: ThreadRow) => row.title ?? 'Untitled',
      },
      {
        title: 'Author',
        render: (row: ThreadRow) => row.user_name ?? row.author_name ?? 'Unknown',
      },
      {
        title: 'Date',
        render: (row: ThreadRow) => formatDate(row.created_at),
      },
      {
        title: 'Replies',
        width: '280px',
        render: (row: ThreadRow) => {
          const isExpanded = expandedThreadId === row.id;

          return (
            <div style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
              <Button
                size="small"
                skin="light"
                onClick={() => {
                  if (isExpanded) {
                    setExpandedThreadId(null);
                    setReplies([]);
                  } else {
                    setExpandedThreadId(row.id);
                    void loadReplies(row.id);
                  }
                }}
              >
                {getRepliesButtonLabel(row, likeCounts, isExpanded)}
              </Button>
            </div>
          );
        },
      },
      {
        title: 'Pin',
        width: '130px',
        render: (row: ThreadRow) => (
          <Button
            size="small"
            skin={row.is_pinned ? 'standard' : 'light'}
            disabled={pinningId === row.id}
            onClick={() => void handlePin(row.id, row.is_pinned)}
          >
            {pinningId === row.id ? '…' : row.is_pinned ? '📌 Unpin' : 'Pin'}
          </Button>
        ),
      },
      {
        title: '',
        width: '120px',
        render: (row: ThreadRow) => (
          <Button
            size="small"
            skin="destructive"
            disabled={deletingId === row.id}
            onClick={() => void handleDelete(row.id)}
          >
            {deletingId === row.id ? 'Deleting…' : 'Delete'}
          </Button>
        ),
      },
    ],
    [deletingId, pinningId, expandedThreadId, likeCounts, handleDelete, handlePin, loadReplies],
  );

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="Forum moderation"
          subtitle="Review and remove forum threads"
        />
        <Page.Content>
          {isPlanLoading ? (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                <Loader size="medium" />
              </div>
            </Card>
          ) : isFree ? (
            <Card>
              <div style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <Text size="medium" weight="bold">Moderation dashboard is a Pro feature</Text>
                <Text size="small" secondary>Upgrade to ForumFlow Pro to access thread moderation, reply management, and more.</Text>
                <a
                  href={`https://www.wix.com/apps/upgrade/ae9501ff-1e53-4cc5-83ff-36b974e644b1${instanceId ? `?appInstanceId=${instanceId}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    backgroundColor: '#3899ec',
                    color: '#fff',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  Upgrade to Pro
                </a>
              </div>
            </Card>
          ) : isLoading ? (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
                <Loader size="medium" />
              </div>
            </Card>
          ) : errorMessage ? (
            <Card>
              <div style={{ padding: '24px' }}>
                <Text>{errorMessage}</Text>
              </div>
            </Card>
          ) : (
            <Card>
              <Table data={paginatedThreads} columns={columns}>
                <TableToolbar>
                  <TableToolbar.ItemGroup position="start">
                    <TableToolbar.Item>
                      <TableToolbar.Label>
                        {filteredThreads.length} {filteredThreads.length === 1 ? 'thread' : 'threads'}
                      </TableToolbar.Label>
                    </TableToolbar.Item>
                  </TableToolbar.ItemGroup>
                </TableToolbar>
                <Table.Content />
                <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e0e0e0' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <input
                      type="text"
                      placeholder="Search threads…"
                      value={searchTerm}
                      onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                      style={{
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        padding: '6px 28px 6px 10px',
                        fontSize: '14px',
                        width: '220px',
                      }}
                    />
                    {searchTerm.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                        style={{
                          position: 'absolute',
                          right: '6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          fontSize: '13px',
                          color: '#9ca3af',
                          padding: '2px',
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 10px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', background: '#fff' }}
                      >
                        ←
                      </button>
                      <span style={{ fontSize: '13px', color: '#6b7280' }}>{currentPage} / {totalPages}</span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 10px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', background: '#fff' }}
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
              </Table>
              {expandedThreadId && (
                <div style={{ padding: '16px', borderTop: '1px solid #e0e0e0' }}>
                  <Text weight="bold">Replies for selected thread</Text>
                  {repliesLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                      <Loader size="small" />
                    </div>
                  ) : replies.length === 0 ? (
                    <div style={{ padding: '12px 0' }}>
                      <Text>No replies.</Text>
                    </div>
                  ) : (
                    replies.map((reply) => (
                      <div
                        key={reply.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 0',
                          borderBottom: '1px solid #f0f0f0',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <Text>{reply.body ?? '—'}</Text>
                          <Text size="small" secondary>{reply.user_name ?? reply.author_name ?? 'Unknown'} · {formatDate(reply.created_at)}</Text>
                        </div>
                        <Button
                          size="small"
                          skin="destructive"
                          disabled={deletingReplyId === reply.id}
                          onClick={() => void handleDeleteReply(reply.id)}
                        >
                          {deletingReplyId === reply.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          )}
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
