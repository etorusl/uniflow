import { useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { api, errorMessage, resultData } from '../../platform/api';
import { Field, Button, Notice, formStyles } from '../../shared/forms';
import { pageStyles } from '../../shared/empty-state';
import { useAuth } from './auth-context';

type Mode = 'login' | 'register' | 'forgot' | 'reset';
const titles: Record<Mode, string> = {
  login: 'Рады видеть вас',
  register: 'Ваш новый учебный ритм',
  forgot: 'Восстановить доступ',
  reset: 'Новый пароль',
};
export function AuthForm({ mode }: { mode: Mode }) {
  const { login, refresh } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email.trim().toLowerCase(), password);
        router.replace('/');
      } else if (mode === 'register') {
        resultData(
          await api.POST('/api/v1/auth/register', {
            body: {
              email,
              password,
              displayName,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            },
          }),
        );
        await login(email.trim().toLowerCase(), password);
        router.replace('/');
      } else if (mode === 'forgot')
        setMessage(
          resultData(await api.POST('/api/v1/auth/forgot-password', { body: { email } })).message,
        );
      else {
        if (!params.token) throw new Error('В ссылке нет токена. Запросите новое письмо.');
        const result = await api.POST('/api/v1/auth/reset-password', {
          body: { token: params.token, password },
        });
        setMessage(resultData(result).message);
        await refresh();
      }
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={[formStyles.card, formStyles.narrow]}>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          {titles[mode]}
        </Text>
        <Text style={pageStyles.subtitle}>
          {mode === 'register'
            ? 'Создайте аккаунт, чтобы собрать планы в одном месте.'
            : 'Расписание и задания ждут вас в UniFlow.'}
        </Text>
      </View>
      {mode === 'register' && (
        <Field
          label="Ваше имя"
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={80}
        />
      )}
      {['login', 'register', 'forgot'].includes(mode) && (
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          maxLength={254}
        />
      )}
      {['login', 'register', 'reset'].includes(mode) && (
        <Field
          label={mode === 'login' ? 'Пароль' : 'Пароль — не менее 12 символов'}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          maxLength={128}
          onSubmitEditing={() => void submit()}
        />
      )}
      {!!error && <Notice message={error} />}
      {!!message && <Notice message={message} success />}
      {!(message && mode === 'reset') && (
        <Button
          busy={busy}
          title={
            {
              login: 'Войти',
              register: 'Создать аккаунт',
              forgot: 'Отправить письмо',
              reset: 'Сохранить пароль',
            }[mode]
          }
          onPress={() => void submit()}
        />
      )}
      <View style={formStyles.row}>
        <Link href="/login" style={formStyles.link}>
          Вход
        </Link>
        <Link href="/register" style={formStyles.link}>
          Регистрация
        </Link>
        {mode === 'login' && (
          <Link href="/forgot-password" style={formStyles.link}>
            Забыли пароль?
          </Link>
        )}
      </View>
    </View>
  );
}
