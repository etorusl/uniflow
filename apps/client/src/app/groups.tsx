import { Text, View } from 'react-native';
import { EmptyState, pageStyles } from '../shared/empty-state';
export default function GroupsScreen() {
  return (
    <>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Группы
        </Text>
        <Text style={pageStyles.subtitle}>Учиться вместе — удобнее.</Text>
      </View>
      <EmptyState
        title="Пространство для вашей группы"
        description="Общие материалы и задания по предметам появятся здесь. Функция готовится к запуску."
        symbol="◎"
      />
    </>
  );
}
