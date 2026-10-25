import { Text, View } from 'react-native';
import { pageStyles } from '../shared/empty-state';
import { RequireSession } from '../features/auth/require-session';
import { TasksWorkspace } from '../features/tasks/tasks-workspace';
export default function TasksScreen() {
  return (
    <>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Задания
        </Text>
        <Text style={pageStyles.subtitle}>От первой заметки до последней галочки.</Text>
      </View>
      <RequireSession>
        <TasksWorkspace />
      </RequireSession>
    </>
  );
}
