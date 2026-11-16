const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export type NotificationTarget =
  | { kind: 'PERSONAL'; taskId: string; groupId?: null }
  | { kind: 'GROUP'; taskId: string; groupId: string };

export function notificationTarget(input: {
  kind?: unknown;
  taskId?: unknown;
  groupId?: unknown;
}): NotificationTarget | undefined {
  if (typeof input.taskId !== 'string' || !UUID.test(input.taskId)) return;
  if (input.kind === 'PERSONAL') return { kind: 'PERSONAL', taskId: input.taskId };
  if (input.kind === 'GROUP' && typeof input.groupId === 'string' && UUID.test(input.groupId))
    return { kind: 'GROUP', taskId: input.taskId, groupId: input.groupId };
}

export function notificationDestination(target: NotificationTarget) {
  return target.kind === 'GROUP'
    ? { pathname: '/groups' as const, params: { taskId: target.taskId, groupId: target.groupId } }
    : { pathname: '/tasks' as const, params: { taskId: target.taskId } };
}
