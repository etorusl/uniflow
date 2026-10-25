import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { EmptyState, pageStyles } from '../shared/empty-state';
import { colors } from '../shared/theme';
import { useAuth } from '../features/auth/auth-context';
import { TodayDashboard } from '../features/tasks/today-dashboard';

export default function TodayScreen() {
  const { user } = useAuth();
  const wide = useWindowDimensions().width >= 1100;
  if (user) return <TodayDashboard />;
  return (
    <>
      <View>
        <Text style={styles.eyebrow}>МЕНЬШЕ ХАОСА. БОЛЬШЕ ВРЕМЕНИ.</Text>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Учёба в одном ритме
        </Text>
        <Text style={pageStyles.subtitle}>Пары, дедлайны и ваша группа — всё под рукой.</Text>
      </View>
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Освободите голову{'\n'}для самого важного.</Text>
          <Text style={styles.heroDescription}>
            UniFlow поможет собрать учебные планы в одном месте и двигаться к целям шаг за шагом.
          </Text>
          <Link href="/register" asChild>
            <Pressable style={styles.heroButton}>
              <Text style={styles.heroButtonText}>Начать планировать →</Text>
            </Pressable>
          </Link>
        </View>
        <View style={styles.heroArt}>
          <View style={styles.artCircle}>
            <Text style={styles.artSymbol}>✓</Text>
          </View>
          <Text style={styles.artLabel}>Всё по плану</Text>
        </View>
      </View>
      <View style={[styles.columns, !wide && styles.stacked]}>
        <View style={styles.column}>
          <Text style={pageStyles.heading}>Ближайшие занятия</Text>
          <EmptyState
            title="Здесь будет ваш учебный день"
            description="Предметы и расписание появятся после настройки вашего пространства."
            symbol="▦"
          />
        </View>
        <View style={styles.column}>
          <Text style={pageStyles.heading}>В фокусе</Text>
          <EmptyState
            title="Каждому дедлайну — своё место"
            description="Личные и групповые задания будут собраны в понятный список."
            symbol="☑"
          />
        </View>
      </View>
    </>
  );
}
const styles = StyleSheet.create({
  eyebrow: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 1.8,
    marginBottom: 10,
  },
  hero: {
    borderRadius: 24,
    padding: 32,
    backgroundColor: '#E9E5FC',
    flexDirection: 'row',
    gap: 18,
    overflow: 'hidden',
    alignItems: 'center',
  },
  heroText: { flex: 1, minWidth: 180 },
  heroTitle: {
    color: '#35276D',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  heroDescription: { color: '#70648E', fontSize: 14, lineHeight: 23, marginTop: 14, maxWidth: 440 },
  heroButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 11,
    alignSelf: 'flex-start',
    marginTop: 24,
  },
  heroButtonText: { color: 'white', fontWeight: '700', fontSize: 13 },
  heroArt: { alignItems: 'center', gap: 14, padding: 12 },
  artCircle: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '8deg' }],
  },
  artSymbol: { fontSize: 40, fontWeight: '600', color: colors.primary },
  artLabel: { color: '#70648E', fontSize: 11, fontWeight: '600' },
  columns: { flexDirection: 'row', gap: 24 },
  stacked: { flexDirection: 'column' },
  column: { flex: 1 },
});
