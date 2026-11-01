import type { Task } from '../../generated/prisma/client.js';
import type { TaskDto } from './tasks.dto.js';

export function taskStatus(
  task: Pick<Task, 'completedAt' | 'deadlineAtCompletion' | 'dueAt'>,
  now = new Date(),
): TaskDto['status'] {
  if (task.completedAt)
    return task.completedAt <= (task.deadlineAtCompletion ?? task.dueAt)
      ? 'COMPLETED_ON_TIME'
      : 'COMPLETED_LATE';
  return task.dueAt < now ? 'OVERDUE' : 'OPEN';
}
