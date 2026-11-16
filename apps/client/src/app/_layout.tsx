import { Slot, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppShell } from '../shared/app-shell';
import { colors } from '../shared/theme';
import { AuthProvider } from '../features/auth/auth-context';
import { NotificationBanner, NotificationInboxProvider } from '../features/notifications/inbox';
import { NotificationResponseHandler } from '../features/notifications/response-handler';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        padding: 32,
        justifyContent: 'center',
        gap: 20,
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ fontSize: 24, color: colors.ink }}>Не удалось открыть страницу</Text>
      <Pressable accessibilityRole="button" onPress={retry}>
        <Text style={{ color: colors.primary }}>Попробовать ещё раз</Text>
      </Pressable>
    </View>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <NotificationInboxProvider>
          <AppShell>
            <NotificationResponseHandler />
            <NotificationBanner />
            <Slot />
          </AppShell>
        </NotificationInboxProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
