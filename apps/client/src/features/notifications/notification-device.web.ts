export const deviceTransport = 'WEB' as const;

export function supportsDevicePush() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof Notification !== 'undefined' &&
    typeof PushManager !== 'undefined' &&
    'serviceWorker' in navigator
  );
}

const serviceWorkerPath = '/uniflow-notifications-sw.js';

function applicationKey(publicKey: string) {
  const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) =>
    c.charCodeAt(0),
  );
}

function encodeKey(value: ArrayBuffer | null) {
  if (!value) throw new Error('В подписке браузера отсутствует ключ.');
  return btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function serviceWorker() {
  const registration = await navigator.serviceWorker.register(serviceWorkerPath, { scope: '/' });
  if (registration.active) return registration;
  const worker = registration.installing ?? registration.waiting;
  if (worker?.state === 'activated') return registration;
  if (!worker) throw new Error('Не удалось запустить уведомления в браузере.');
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error);
      else resolve();
    };
    const changed = () => {
      if (worker.state === 'activated') finish();
      if (worker.state === 'redundant')
        finish(new Error('Не удалось запустить уведомления в браузере.'));
    };
    const timer = setTimeout(
      () => finish(new Error('Браузер не запустил уведомления вовремя.')),
      10_000,
    );
    worker.addEventListener('statechange', changed);
    changed();
  });
  return registration;
}

function serialize(subscription: PushSubscription) {
  return {
    transport: deviceTransport,
    address: subscription.endpoint,
    p256dh: encodeKey(subscription.getKey('p256dh')),
    auth: encodeKey(subscription.getKey('auth')),
  };
}

export async function requestDeviceSubscription(publicKey: string | null) {
  if (!supportsDevicePush() || !publicKey)
    throw new Error('Браузер или окружение не поддерживает push-уведомления.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Разрешите уведомления для UniFlow в браузере.');
  const registration = await serviceWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && encodeKey(subscription.options.applicationServerKey) !== publicKey) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationKey(publicKey),
  });
  return serialize(subscription);
}

export async function currentDeviceSubscription(publicKey: string | null) {
  if (!supportsDevicePush() || Notification.permission !== 'granted' || !publicKey) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription && encodeKey(subscription.options.applicationServerKey) === publicKey)
    return serialize(subscription);
}

export async function removeDeviceSubscription() {
  if (!supportsDevicePush()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  await subscription?.unsubscribe();
}

export function requestLocalAndroidNotifications(): Promise<void> {
  return Promise.resolve();
}

export const presentLocalAndroidReminder: (notice: {
  id: string;
  kind: string;
  taskId: string;
  groupId: string | null;
}) => Promise<void> = async () => undefined;
