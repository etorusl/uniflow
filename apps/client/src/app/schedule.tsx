import { Text, View } from 'react-native';
import { EmptyState, pageStyles } from '../shared/empty-state';
export default function ScheduleScreen() {
  return (
    <>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Расписание
        </Text>
        <Text style={pageStyles.subtitle}>Учебная неделя без лишних сюрпризов.</Text>
      </View>
      <EmptyState
        title="Место для ваших пар"
        description="Здесь будут занятия на семестр, чётные и нечётные недели, переносы и отмены."
        symbol="▦"
      />
    </>
  );
}
