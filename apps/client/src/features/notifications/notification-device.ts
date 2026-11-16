import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { notificationTarget } from './notification-destination';

export const deviceTransport = 'ANDROID' as const;
export const supportsDevicePush = () => Platform.OS === 'android';
const channelId = 'deadlines';

export async function requestLocalAndroidNotifications() {
  await Notifications.setNotificationChannelAsync(channelId, {
    name: 'Дедлайны',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  const current = await Notifications.getPermissionsAsync();
  const result = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!result.granted) throw new Error('Разрешите уведомления UniFlow в настройках Android.');
}

type AndroidSubscription = { transport: 'ANDROID'; address: string };

export const requestDeviceSubscription: (
  key: string | null,
) => Promise<AndroidSubscription> = async () => {
  await requestLocalAndroidNotifications();
  const token = await Notifications.getDevicePushTokenAsync();
  if (token.type !== 'android' || typeof token.data !== 'string')
    throw new Error('Не удалось получить токен Android.');
  return { transport: deviceTransport, address: token.data };
};

export const currentDeviceSubscription: (
  key: string | null,
) => Promise<AndroidSubscription | undefined> = async () => {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const token = await Notifications.getDevicePushTokenAsync();
  if (token.type === 'android' && typeof token.data === 'string')
    return { transport: deviceTransport, address: token.data };
};

export function removeDeviceSubscription(): Promise<void> {
  return Promise.resolve();
}

export async function presentLocalAndroidReminder(notice: {
  id: string;
  kind: string;
  taskId: string;
  groupId: string | null;
}) {
  const target = notificationTarget(notice);
  if (!target || !(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: notice.id,
    content: {
      title: 'Дедлайн · UniFlow',
      body: 'Скоро дедлайн. Откройте UniFlow, чтобы посмотреть задание.',
      data: target,
    },
    trigger: { channelId },
  });
}
