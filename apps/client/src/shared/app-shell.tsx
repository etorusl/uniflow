import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, usePathname } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../platform/api';
import { colors } from './theme';

const navigation = [
  { href: '/' as const, label: 'Сегодня', icon: '◷' },
  { href: '/schedule' as const, label: 'Расписание', icon: '▦' },
  { href: '/tasks' as const, label: 'Задания', icon: '☑' },
  { href: '/groups' as const, label: 'Группы', icon: '◎' },
];
export function AppShell({ children }: { children: ReactNode }) {
  const wide = useWindowDimensions().width >= 900;
  const pathname = usePathname();
  const [connection, setConnection] = useState<'loading' | 'ready' | 'error'>('loading');
  const check = useCallback(async (signal?: AbortSignal) => {
    setConnection('loading');
    try {
      const response = await api.GET('/api/v1/health/ready', {
        signal: signal ?? AbortSignal.timeout(8000),
      });
      if (!signal?.aborted) setConnection(response.response.ok ? 'ready' : 'error');
    } catch {
      if (!signal?.aborted) setConnection('error');
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [check]);
  const menu = navigation.map((item) => (
    <Link key={item.href} href={item.href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: pathname === item.href }}
        style={StyleSheet.flatten([
          styles.navItem,
          !wide && styles.mobileNav,
          pathname === item.href && styles.active,
        ])}
      >
        <Text style={[styles.navIcon, pathname === item.href && styles.activeText]}>
          {item.icon}
        </Text>
        <Text style={[styles.navLabel, pathname === item.href && styles.activeText]}>
          {item.label}
        </Text>
      </Pressable>
    </Link>
  ));
  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.frame, !wide && styles.mobileFrame]}>
        {wide && (
          <View style={styles.sidebar}>
            <View style={styles.brand}>
              <Text style={styles.brandMark}>U</Text>
              <Text style={styles.brandName}>UniFlow</Text>
            </View>
            <Text style={styles.caption}>ВАШ УЧЕБНЫЙ РИТМ</Text>
            <View style={styles.menu}>{menu}</View>
            <View style={styles.sidebarFoot}>
              <Text style={styles.footTitle}>Больше ясности.</Text>
              <Text style={styles.footText}>Меньше суеты перед дедлайном.</Text>
            </View>
          </View>
        )}
        <View style={styles.main}>
          <View style={styles.header}>
            <View>
              {!wide && <Text style={styles.mobileBrand}>UniFlow</Text>}
              <Text style={styles.headerLabel}>Пространство для учёбы</Text>
            </View>
            <View style={styles.connection}>
              {connection === 'loading' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: connection === 'ready' ? colors.green : colors.danger },
                  ]}
                />
              )}
              <Text style={styles.connectionText}>
                {connection === 'loading'
                  ? 'Подключаемся'
                  : connection === 'ready'
                    ? 'На связи'
                    : 'Нет соединения'}
              </Text>
            </View>
          </View>
          {connection === 'error' && (
            <View accessibilityRole="alert" style={styles.banner}>
              <Text style={styles.bannerText}>
                Не удалось подключиться к UniFlow. Проверьте соединение и повторите попытку.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => void check()}>
                <Text style={styles.retry}>Повторить</Text>
              </Pressable>
            </View>
          )}
          <ScrollView contentContainerStyle={[styles.content, !wide && styles.mobileContent]}>
            {children}
          </ScrollView>
        </View>
        {!wide && <View style={styles.bottomNav}>{menu}</View>}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  frame: { flex: 1, flexDirection: 'row' },
  mobileFrame: { flexDirection: 'column' },
  sidebar: {
    width: 242,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderColor: colors.border,
    padding: 26,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 50 },
  brandMark: {
    backgroundColor: colors.primary,
    color: 'white',
    width: 37,
    height: 37,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 37,
    fontSize: 24,
    fontWeight: '800',
  },
  brandName: { color: colors.ink, fontSize: 25, fontWeight: '800', letterSpacing: -0.7 },
  caption: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
    fontWeight: '700',
    marginBottom: 18,
  },
  menu: { gap: 8 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 12 },
  navIcon: { fontSize: 24, color: colors.muted },
  navLabel: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  active: { backgroundColor: colors.primarySoft },
  activeText: { color: colors.primary },
  sidebarFoot: { marginTop: 'auto', paddingTop: 30 },
  footTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  footText: { color: colors.muted, fontSize: 12, lineHeight: 20, marginTop: 5 },
  main: { flex: 1, minWidth: 0 },
  header: {
    height: 88,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLabel: { color: colors.muted, fontSize: 13 },
  mobileBrand: { fontWeight: '800', color: colors.primary, fontSize: 21, marginBottom: 3 },
  connection: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  connectionText: { color: colors.muted, fontSize: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  content: { padding: 40, maxWidth: 1280, width: '100%', alignSelf: 'center', gap: 24 },
  mobileContent: { padding: 20 },
  bottomNav: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 6,
  },
  mobileNav: { flexDirection: 'column', gap: 3, paddingHorizontal: 12, paddingVertical: 7 },
  banner: {
    backgroundColor: '#FFF0EF',
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bannerText: { color: colors.danger, flex: 1, minWidth: 200, fontSize: 13 },
  retry: { color: colors.danger, fontWeight: '700' },
});
