import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '../features/auth/auth-context';
import { RequireSession } from '../features/auth/require-session';
import { api, resultData, errorMessage } from '../platform/api';
import { Button, Field, Notice, formStyles } from '../shared/forms';
import { pageStyles } from '../shared/empty-state';

export default function ProfileScreen() {
  const { user, setUser, logout } = useAuth();
  const [displayName, setName] = useState('');
  const [timeZone, setZone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (user) {
      setName(user.displayName);
      setZone(user.timeZone);
    }
  }, [user]);
  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setUser(resultData(await api.PATCH('/api/v1/users/me', { body: { displayName, timeZone } })));
      setMessage('Профиль сохранён.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    setBusy(true);
    try {
      await logout();
      router.replace('/');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <RequireSession>
      <View style={[formStyles.card, formStyles.narrow]}>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Мой профиль
        </Text>
        <Text style={formStyles.muted}>{user?.email}</Text>
        <Field label="Ваше имя" value={displayName} onChangeText={setName} maxLength={80} />
        <Field
          label="Часовой пояс"
          value={timeZone}
          onChangeText={setZone}
          placeholder="Asia/Novosibirsk"
        />
        {!!error && <Notice message={error} />}
        {!!message && <Notice success message={message} />}
        <Button title="Сохранить профиль" busy={busy} onPress={() => void save()} />
        <Button title="Выйти из аккаунта" busy={busy} secondary onPress={() => void leave()} />
      </View>
    </RequireSession>
  );
}
