import { Link } from 'expo-router';
import { DateTime } from 'luxon';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Text, View } from 'react-native';
import type { components } from '@uniflow/api-client';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { Button, formStyles, Notice } from '../../shared/forms';
import { colors } from '../../shared/theme';
import { useAuth } from '../auth/auth-context';

type Inbox = components['schemas']['NotificationInboxDto'];
type Reminder = components['schemas']['NotificationNoticeDto'];
type InboxContextValue = {
  inbox: Inbox | null;
  error: string;
  markRead: (id: string) => Promise<void>;
};

const InboxContext = createContext<InboxContextValue | null>(null);

export function useNotificationInbox() {
  return useContext(InboxContext);
}

export function NotificationInboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<{ userId?: string; inbox: Inbox | null; error: string }>({
    inbox: null,
    error: '',
  });
  const acknowledgements = useRef(new Map<string, string>());

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let requestInFlight = false;
    const acknowledged = new Map<string, string>();
    acknowledgements.current = acknowledged;
    async function reload() {
      if (requestInFlight || AppState.currentState === 'background') return;
      requestInFlight = true;
      try {
        const response = await api.GET('/api/v1/notifications/inbox', {
          signal: controller.signal,
        });
        const next = resultData(response);
        if (controller.signal.aborted) return;
        let recentlyRead = 0;
        const items = next.items.map((item) => {
          const readAt = acknowledged.get(item.id);
          if (item.readAt || !readAt) return item;
          recentlyRead++;
          return { ...item, readAt };
        });
        setState({
          userId,
          inbox: { items, unreadCount: Math.max(0, next.unreadCount - recentlyRead) },
          error: '',
        });
      } catch (failure) {
        if (!controller.signal.aborted)
          setState((current) => ({
            userId,
            inbox: current.userId === userId ? current.inbox : null,
            error: errorMessage(failure),
          }));
      } finally {
        requestInFlight = false;
      }
    }
    void reload();
    const interval = setInterval(() => void reload(), 5000);
    const activity = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    return () => {
      controller.abort();
      clearInterval(interval);
      activity.remove();
    };
  }, [userId]);

  const markRead = useCallback(
    async (id: string) => {
      const acknowledged = acknowledgements.current;
      if (!userId || acknowledged.has(id)) return;
      try {
        ensureSuccess(
          await api.POST('/api/v1/notifications/inbox/{id}/read', { params: { path: { id } } }),
        );
        if (acknowledgements.current !== acknowledged || acknowledged.has(id)) return;
        const readAt = new Date().toISOString();
        acknowledged.set(id, readAt);
        setState((current) => {
          if (
            current.userId !== userId ||
            !current.inbox?.items.some((item) => item.id === id && !item.readAt)
          )
            return current;
          return {
            userId,
            error: '',
            inbox: {
              unreadCount: Math.max(0, current.inbox.unreadCount - 1),
              items: current.inbox.items.map((item) =>
                item.id === id ? { ...item, readAt } : item,
              ),
            },
          };
        });
      } catch (failure) {
        setState((current) =>
          current.userId === userId ? { ...current, error: errorMessage(failure) } : current,
        );
      }
    },
    [userId],
  );

  const visible = userId && state.userId === userId ? state : { inbox: null, error: '' };
  return <InboxContext.Provider value={{ ...visible, markRead }}>{children}</InboxContext.Provider>;
}

function ReminderLink({ item, open }: { item: Reminder; open: (id: string) => void }) {
  const href =
    item.kind === 'GROUP' && item.groupId
      ? { pathname: '/groups' as const, params: { groupId: item.groupId, taskId: item.taskId } }
      : { pathname: '/tasks' as const, params: { taskId: item.taskId } };
  return (
    <Link href={href} onPress={() => open(item.id)} style={formStyles.link}>
      Открыть задание
    </Link>
  );
}

export function NotificationBanner() {
  const context = useNotificationInbox();
  const reminder = context?.inbox?.items.find((item) => !item.readAt);
  if (!context || !reminder) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[formStyles.card, { backgroundColor: colors.primarySoft }]}
    >
      <Text accessibilityRole="header" style={{ fontWeight: '700', color: colors.ink }}>
        Напоминание о дедлайне
      </Text>
      <View style={formStyles.row}>
        <ReminderLink item={reminder} open={(id) => void context.markRead(id)} />
        <Button title="Прочитано" secondary onPress={() => void context.markRead(reminder.id)} />
      </View>
    </View>
  );
}

export function NotificationInbox() {
  const context = useNotificationInbox();
  const { user } = useAuth();
  if (!context) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ fontWeight: '700', color: colors.ink }}>
        Входящие напоминания
      </Text>
      {!!context.error && <Notice message={context.error} />}
      {context.inbox && (
        <Text style={formStyles.muted}>
          {context.inbox.items.length
            ? `Непрочитанных: ${context.inbox.unreadCount}`
            : 'Напоминаний пока нет.'}
        </Text>
      )}
      {context.inbox?.items.map((item) => (
        <View key={item.id} style={[formStyles.card, { gap: 8 }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>
            {item.kind === 'GROUP' ? 'Групповой дедлайн' : 'Личный дедлайн'}
          </Text>
          <Text style={formStyles.muted}>
            {DateTime.fromISO(item.createdAt)
              .setZone(user?.timeZone ?? 'UTC')
              .setLocale('ru')
              .toLocaleString(DateTime.DATETIME_MED)}
          </Text>
          <View style={formStyles.row}>
            <ReminderLink item={item} open={(id) => void context.markRead(id)} />
            {!item.readAt && (
              <Button title="Прочитано" secondary onPress={() => void context.markRead(item.id)} />
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
