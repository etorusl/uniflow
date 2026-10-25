import { Text, View } from 'react-native';
import { pageStyles } from '../shared/empty-state';
import { RequireSession } from '../features/auth/require-session';
import { ScheduleWorkspace } from '../features/study/schedule-workspace';
export default function ScheduleScreen() {
  return (
    <>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Расписание
        </Text>
        <Text style={pageStyles.subtitle}>Учебная неделя без лишних сюрпризов.</Text>
      </View>
      <RequireSession>
        <ScheduleWorkspace />
      </RequireSession>
    </>
  );
}
