import { type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';
import { DateTime } from 'luxon';
import type { components } from '@uniflow/api-client';
import { errorMessage } from '../../platform/api';
import { Button, formStyles } from '../../shared/forms';

export type Group = components['schemas']['GroupDto'];
export type GroupTask = components['schemas']['GroupTaskDto'];
export type GroupMember = components['schemas']['GroupMemberDto'];
export type Invitation = components['schemas']['GroupInvitationDto'];
export type NewInvitation = components['schemas']['NewGroupInvitationDto'];
export type GroupRole = Group['role'];
export type GroupInput = components['schemas']['GroupInputDto'];

export const groupPageSize = 15;
export const groupRoles: Record<GroupRole, string> = {
  OWNER: 'Владелец',
  MODERATOR: 'Модератор',
  MEMBER: 'Участник',
};
export const groupTaskModes: Record<GroupTask['mode'], string> = {
  INDIVIDUAL: 'Индивидуальное выполнение',
  SHARED: 'Общее выполнение',
};
export const groupTaskStatuses: Record<GroupTask['status'], string> = {
  OPEN: 'В работе',
  OVERDUE: 'Просрочено',
  COMPLETED_ON_TIME: 'Выполнено вовремя',
  COMPLETED_LATE: 'Выполнено с опозданием',
};

export function groupDate(iso: string, zone: string) {
  return DateTime.fromISO(iso).setZone(zone).setLocale('ru').toLocaleString(DateTime.DATETIME_MED);
}
export function useGroupActions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, clear: () => setError(''), run };
}
export function GroupPagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / groupPageSize));
  if (page === 1 && last === 1) return null;
  return (
    <View style={formStyles.row}>
      <Button title="Назад" secondary disabled={page <= 1} onPress={() => onChange(page - 1)} />
      <Text style={formStyles.muted}>
        {page} из {last}
      </Text>
      <Button title="Далее" secondary disabled={page >= last} onPress={() => onChange(page + 1)} />
    </View>
  );
}
export function GroupPanel({ children }: { children: ReactNode }) {
  return <View style={formStyles.card}>{children}</View>;
}
