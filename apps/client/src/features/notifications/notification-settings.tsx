import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Switch, Text, View } from 'react-native';
import type { components } from '@uniflow/api-client';
import { api, ensureSuccess, errorMessage, resultData } from '../../platform/api';
import { pageStyles } from '../../shared/empty-state';
import { Button, Field, Notice, formStyles } from '../../shared/forms';
import { colors } from '../../shared/theme';
import {
  deviceTransport,
  removeDeviceSubscription,
  requestDeviceSubscription,
  requestLocalAndroidNotifications,
  supportsDevicePush,
} from './notification-device';

type Settings = components['schemas']['ReminderSettingsDto'];
type Action = 'preferences' | 'device' | 'android-local';

export function NotificationSettings() {
  const [settings, setSettings] = useState<Settings>();
  const [enabled, setEnabled] = useState(false);
  const [minutes, setMinutes] = useState('60');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Action>();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError('');
    try {
      const response = resultData(await api.GET('/api/v1/notifications/settings', { signal }));
      if (signal?.aborted) return;
      setSettings(response);
      setEnabled(response.enabled);
      setMinutes(String(response.minutesBefore));
    } catch (cause) {
      if (!signal?.aborted) setError(errorMessage(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  async function act(action: Action, run: () => Promise<void>) {
    setBusy(action);
    setError('');
    setStatus('');
    try {
      await run();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(undefined);
    }
  }

  function save() {
    return act('preferences', async () => {
      const minutesBefore = Number(minutes.trim());
      if (
        !/^\d+$/.test(minutes.trim()) ||
        !Number.isInteger(minutesBefore) ||
        minutesBefore < 1 ||
        minutesBefore > 10080
      )
        throw new Error('Укажите целое число минут от 1 до 10080.');
      const response = resultData(
        await api.PATCH('/api/v1/notifications/settings', {
          body: { enabled, minutesBefore },
        }),
      );
      setSettings(response);
      setStatus('Настройки напоминаний сохранены.');
    });
  }

  const subscribed = settings?.subscribed.includes(deviceTransport) ?? false;
  const provider = Platform.OS === 'web' ? settings?.webAvailable : settings?.androidAvailable;
  const canSubscribe = provider && supportsDevicePush();

  function toggleSubscription() {
    return act('device', async () => {
      if (subscribed) {
        ensureSuccess(
          await api.DELETE('/api/v1/notifications/subscriptions/{transport}', {
            params: { path: { transport: deviceTransport } },
          }),
        );
        await removeDeviceSubscription();
        setStatus('Системные push на этом устройстве отключены.');
      } else {
        const request = await requestDeviceSubscription(settings?.webPublicKey ?? null);
        ensureSuccess(await api.POST('/api/v1/notifications/subscriptions', { body: request }));
        setStatus('Устройство подключено к системным уведомлениям.');
      }
      const response = resultData(await api.GET('/api/v1/notifications/settings'));
      setSettings(response);
    });
  }

  return (
    <View style={[formStyles.card, formStyles.narrow]}>
      <Text accessibilityRole="header" style={pageStyles.heading}>
        Напоминания
      </Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : settings ? (
        <>
          <View style={formStyles.row}>
            <Text style={formStyles.muted}>Напоминать о дедлайнах</Text>
            <Switch
              accessibilityLabel="Напоминать о дедлайнах"
              value={enabled}
              onValueChange={setEnabled}
            />
          </View>
          <Field
            label="Минут до дедлайна"
            keyboardType="number-pad"
            value={minutes}
            onChangeText={setMinutes}
            maxLength={5}
          />
          <Button
            title="Сохранить напоминания"
            busy={busy === 'preferences'}
            disabled={!!busy}
            onPress={() => void save()}
          />
          <Text style={formStyles.muted}>
            Напоминания приходят в профиль и появляются в открытом UniFlow. Системные push могут
            приходить, когда приложение закрыто.
          </Text>
          {subscribed || canSubscribe ? (
            <Button
              title={subscribed ? 'Отключить системные push' : 'Подключить системные push'}
              secondary
              busy={busy === 'device'}
              disabled={!!busy}
              onPress={() => void toggleSubscription()}
            />
          ) : (
            <Text style={formStyles.muted}>
              {provider
                ? 'Системные push недоступны в этом браузере.'
                : 'Провайдер системных push для этой платформы не настроен.'}
            </Text>
          )}
          {Platform.OS === 'android' && !provider && (
            <Button
              title="Разрешить уведомления при открытом приложении"
              secondary
              busy={busy === 'android-local'}
              disabled={!!busy}
              onPress={() =>
                void act('android-local', async () => {
                  await requestLocalAndroidNotifications();
                  setStatus('Android разрешил показывать уведомления, пока UniFlow открыт.');
                })
              }
            />
          )}
        </>
      ) : (
        <Button title="Повторить загрузку настроек" secondary onPress={() => void load()} />
      )}
      {!!error && <Notice message={error} />}
      {!!status && <Notice message={status} success />}
    </View>
  );
}
