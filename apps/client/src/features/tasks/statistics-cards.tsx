import type { components } from '@uniflow/api-client';
import { Text, View } from 'react-native';
import { colors } from '../../shared/theme';
import { formStyles } from '../../shared/forms';

export type Statistics = components['schemas']['StatisticsDto'];
export function StatisticsCards({ value }: { value: Statistics }) {
  const cards = [
    { label: 'Всего заданий', value: value.total, color: colors.primary },
    { label: 'Выполнено вовремя', value: value.completedOnTime, color: colors.green },
    { label: 'С опозданием', value: value.completedLate, color: '#A77522' },
    { label: 'Просрочено', value: value.overdue, color: colors.danger },
  ];
  return (
    <View style={{ gap: 12 }}>
      <View style={formStyles.row}>
        {cards.map((card) => (
          <View
            key={card.label}
            accessibilityLabel={`${card.label}: ${card.value}`}
            style={{
              flex: 1,
              minWidth: 132,
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 18,
              gap: 6,
            }}
          >
            <Text style={{ fontSize: 29, fontWeight: '800', color: card.color }}>{card.value}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{card.label}</Text>
          </View>
        ))}
      </View>
      <Text style={formStyles.muted}>
        {value.completionRate}% завершено · {value.open} в работе
      </Text>
      <View
        style={{ backgroundColor: colors.border, height: 6, borderRadius: 3, overflow: 'hidden' }}
      >
        <View
          style={{ width: `${value.completionRate}%`, height: 6, backgroundColor: colors.primary }}
        />
      </View>
    </View>
  );
}
