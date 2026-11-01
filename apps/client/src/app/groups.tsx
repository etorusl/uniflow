import { Text, View } from 'react-native';
import { pageStyles } from '../shared/empty-state';
import { RequireSession } from '../features/auth/require-session';
import { GroupsWorkspace } from '../features/groups/groups-workspace';
export default function GroupsScreen() {
  return (
    <>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Группы
        </Text>
        <Text style={pageStyles.subtitle}>Учиться вместе — удобнее.</Text>
      </View>
      <RequireSession>
        <GroupsWorkspace />
      </RequireSession>
    </>
  );
}
