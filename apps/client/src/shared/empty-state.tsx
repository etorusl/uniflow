import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export function EmptyState({
  title,
  description,
  symbol = '✦',
}: {
  title: string;
  description: string;
  symbol?: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.symbol}>
        <Text style={styles.symbolText}>{symbol}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}
export const pageStyles = StyleSheet.create({
  title: {
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.6,
  },
  subtitle: { color: colors.muted, lineHeight: 24, fontSize: 15, marginTop: 6 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 15 },
});
const styles = StyleSheet.create({
  card: {
    padding: 32,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 12,
  },
  symbol: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolText: { fontSize: 25, color: colors.primary },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  description: {
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 23,
    fontSize: 14,
    maxWidth: 380,
  },
});
