import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { api, ensureSuccess, resultData } from '../../platform/api';
import { useAuth } from '../auth/auth-context';
import { useNotificationInbox } from './inbox';
import { notificationDestination, notificationTarget } from './notification-destination';
import { currentDeviceSubscription, presentLocalAndroidReminder } from './notification-device';

export function NotificationResponseHandler() {
  const { user } = useAuth();
  const navigationReady = !!useRootNavigationState()?.key;
  const inbox = useNotificationInbox()?.inbox;
  const previous = useRef<{ userId: string; newest: string; seen: Set<string> } | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!navigationReady) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    let active = true;
    let consumed: string | undefined;

    function handle(response: Notifications.NotificationResponse | null) {
      if (!active || response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const notice = response.notification.request;
      if (consumed === notice.identifier) return;
      const target = notificationTarget(notice.content.data ?? {});
      if (!target) return;
      consumed = notice.identifier;
      router.push(notificationDestination(target));
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    }

    const listener = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync()
      .then(handle)
      .catch(() => undefined);
    return () => {
      active = false;
      listener.remove();
      Notifications.setNotificationHandler(null);
    };
  }, [navigationReady]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) {
      previous.current = undefined;
      return;
    }
    if (!inbox || AppState.currentState !== 'active') return;
    const newest = inbox.items[0]?.createdAt ?? '';
    const last = previous.current;
    if (!last || last.userId !== userId) {
      previous.current = { userId, newest, seen: new Set(inbox.items.map(({ id }) => id)) };
      return;
    }
    const beyond = inbox.items.filter(
      (item) => !item.readAt && !last.seen.has(item.id) && item.createdAt >= last.newest,
    );
    previous.current = {
      userId,
      newest: newest > last.newest ? newest : last.newest,
      seen: new Set(inbox.items.map(({ id }) => id)),
    };
    if (!beyond.length) return;
    let active = true;
    void (async () => {
      try {
        const settings = resultData(await api.GET('/api/v1/notifications/settings'));
        if (!active || (settings.androidAvailable && settings.subscribed.includes('ANDROID')))
          return;
        // The inbox retains all due notices. Present only one system banner per poll.
        if (AppState.currentState === 'active') await presentLocalAndroidReminder(beyond[0]!);
      } catch {
        // This optional foreground presentation does not affect the persisted inbox.
      }
    })();
    return () => {
      active = false;
    };
  }, [inbox, userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    async function sync(address?: string) {
      try {
        const settings = resultData(await api.GET('/api/v1/notifications/settings'));
        if (!active || !settings.androidAvailable || !settings.subscribed.includes('ANDROID'))
          return;
        const body = address
          ? { transport: 'ANDROID' as const, address }
          : await currentDeviceSubscription(null);
        if (!active) return;
        if (body)
          ensureSuccess(
            await api.POST('/api/v1/notifications/subscriptions', {
              body: { ...body, refreshOnly: true },
            }),
          );
        else
          ensureSuccess(
            await api.DELETE('/api/v1/notifications/subscriptions/{transport}', {
              params: { path: { transport: 'ANDROID' } },
            }),
          );
      } catch {
        // The subscription remains available for a later retry after a transient error.
      }
    }

    const token = Notifications.addPushTokenListener((value) => {
      if (value.type === 'android' && typeof value.data === 'string') void sync(value.data);
    });
    const state = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync();
    });
    void sync();
    return () => {
      active = false;
      token.remove();
      state.remove();
    };
  }, [userId]);
  return null;
}
