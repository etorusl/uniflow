import { Text, View } from 'react-native';
import { EmptyState, pageStyles } from '../shared/empty-state';
export default function TasksScreen() {
  return (
    <>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Задания
        </Text>
        <Text style={pageStyles.subtitle}>От первой заметки до последней галочки.</Text>
      </View>
      <EmptyState
        title="Ваши задачи будут здесь"
        description="Дедлайны, вложения и отметки о выполнении помогут видеть следующий шаг."
        symbol="☑"
      />
    </>
  );
}
