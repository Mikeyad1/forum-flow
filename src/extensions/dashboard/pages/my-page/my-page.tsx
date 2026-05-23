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
import { httpClient } from '@wix/essentials';
import '@wix/design-system/styles.global.css';

type ThreadRow = {
  id: string;
  title: string | null;
  user_name: string | null;
  author_name: string | null;
  created_at: string | null;
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

const DashboardPage: FC = () => {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);

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
        return;
      }

      const data = (await response.json()) as ThreadRow[];
      setThreads(Array.isArray(data) ? data : []);
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
    void loadThreads();
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
        width: '100px',
        render: (row: ThreadRow) => (
          <Button
            size="small"
            skin="light"
            onClick={() => {
              if (expandedThreadId === row.id) {
                setExpandedThreadId(null);
                setReplies([]);
              } else {
                setExpandedThreadId(row.id);
                void loadReplies(row.id);
              }
            }}
          >
            {expandedThreadId === row.id ? 'Hide' : 'View Replies'}
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
    [deletingId, expandedThreadId, handleDelete, loadReplies],
  );

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="Forum moderation"
          subtitle="Review and remove forum threads"
        />
        <Page.Content>
          {isLoading ? (
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
              <Table data={threads} columns={columns}>
                <TableToolbar>
                  <TableToolbar.ItemGroup position="start">
                    <TableToolbar.Item>
                      <TableToolbar.Label>
                        {threads.length} {threads.length === 1 ? 'thread' : 'threads'}
                      </TableToolbar.Label>
                    </TableToolbar.Item>
                  </TableToolbar.ItemGroup>
                </TableToolbar>
                <Table.Content />
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
