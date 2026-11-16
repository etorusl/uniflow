import type { ReactNode } from 'react';
import { Link, useLocalSearchParams, usePathname } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from './auth-context';
import { formStyles } from '../../shared/forms';
import { pageStyles } from '../../shared/empty-state';
import { colors } from '../../shared/theme';
import { notificationTarget } from '../notifications/notification-destination';

export function RequireSession({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const reminder =
    pathname === '/tasks' ? notificationTarget({ kind: 'PERSONAL', taskId }) : undefined;
  if (loading)
    return <ActivityIndicator accessibilityLabel="Загрузка аккаунта" color={colors.primary} />;
  if (!user)
    return (
      <View style={formStyles.card}>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Ваше пространство для учёбы
        </Text>
        <Text style={formStyles.muted}>
          Войдите, чтобы видеть свои предметы, расписание и задания.
        </Text>
        <Link
          href={{ pathname: '/login', params: { taskId: reminder?.taskId } }}
          style={formStyles.link}
        >
          Войти в аккаунт →
        </Link>
        <Link
          href={{ pathname: '/register', params: { taskId: reminder?.taskId } }}
          style={formStyles.link}
        >
          Создать аккаунт
        </Link>
      </View>
    );
  return children;
}
