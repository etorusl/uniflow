import type { ReactNode } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from './auth-context';
import { formStyles } from '../../shared/forms';
import { pageStyles } from '../../shared/empty-state';
import { colors } from '../../shared/theme';

export function RequireSession({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
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
        <Link href="/login" style={formStyles.link}>
          Войти в аккаунт →
        </Link>
        <Link href="/register" style={formStyles.link}>
          Создать аккаунт
        </Link>
      </View>
    );
  return children;
}
