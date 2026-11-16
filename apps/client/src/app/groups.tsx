import { Link, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useAuth } from '../features/auth/auth-context';
import { GroupDetails } from '../features/groups/group-details';
import { GroupDirectory } from '../features/groups/group-directory';
import { pageStyles } from '../shared/empty-state';
import { formStyles } from '../shared/forms';
import { colors } from '../shared/theme';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const invitePattern = /^[a-z0-9_-]{20}$/i;
export default function GroupsScreen() {
  const { user, loading } = useAuth();
  const params = useLocalSearchParams<{ invite?: string; groupId?: string; taskId?: string }>();
  const invite =
    typeof params.invite === 'string' && invitePattern.test(params.invite)
      ? params.invite
      : undefined;
  const groupId =
    typeof params.groupId === 'string' && uuid.test(params.groupId) ? params.groupId : undefined;
  const taskId =
    typeof params.taskId === 'string' && uuid.test(params.taskId) ? params.taskId : undefined;
  if (loading)
    return <ActivityIndicator accessibilityLabel="Загрузка аккаунта" color={colors.primary} />;
  if (!user)
    return (
      <View style={formStyles.card}>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Группы
        </Text>
        <Text style={pageStyles.subtitle}>
          {invite
            ? 'Войдите, чтобы принять приглашение.'
            : 'Войдите, чтобы видеть свои учебные группы.'}
        </Text>
        <Link
          style={formStyles.link}
          href={{ pathname: '/login', params: { invite, groupId, taskId } }}
        >
          Войти в аккаунт
        </Link>
        <Link
          style={formStyles.link}
          href={{ pathname: '/register', params: { invite, groupId, taskId } }}
        >
          Создать аккаунт
        </Link>
      </View>
    );
  if (groupId)
    return (
      <GroupDetails
        key={`${user.id}:${groupId}`}
        groupId={groupId}
        viewerId={user.id}
        zone={user.timeZone}
        taskId={taskId}
      />
    );
  return <GroupDirectory key={`${user.id}:${invite ?? ''}`} invite={invite} />;
}
