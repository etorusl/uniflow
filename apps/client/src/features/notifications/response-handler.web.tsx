import { useEffect } from 'react';
import { api, ensureSuccess, resultData } from '../../platform/api';
import { useAuth } from '../auth/auth-context';
import { currentDeviceSubscription, supportsDevicePush } from './notification-device.web';

export function NotificationResponseHandler() {
  const { user } = useAuth();
  const userId = user?.id;
  useEffect(() => {
    if (!userId || !supportsDevicePush()) return;
    let active = true;
    async function sync() {
      try {
        const settings = resultData(await api.GET('/api/v1/notifications/settings'));
        if (!active || !settings.webAvailable || !settings.subscribed.includes('WEB')) return;
        const body = await currentDeviceSubscription(settings.webPublicKey);
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
              params: { path: { transport: 'WEB' } },
            }),
          );
      } catch {
        // The subscription can be reconciled the next time the page gains focus.
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void sync();
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId]);
  return null;
}
