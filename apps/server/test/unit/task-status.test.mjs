import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taskStatus } from '../../dist/modules/tasks/tasks.service.js';

test('completion on the deadline is on time and later edits do not rewrite history', () => {
  const deadline = new Date('2026-10-25T12:00:00Z');
  assert.equal(
    taskStatus({
      dueAt: new Date('2026-10-01T12:00:00Z'),
      completedAt: deadline,
      deadlineAtCompletion: deadline,
    }),
    'COMPLETED_ON_TIME',
  );
  assert.equal(
    taskStatus({
      dueAt: new Date('2026-12-01T12:00:00Z'),
      completedAt: new Date(deadline.getTime() + 1),
      deadlineAtCompletion: deadline,
    }),
    'COMPLETED_LATE',
  );
  assert.equal(
    taskStatus(
      { dueAt: deadline, completedAt: null, deadlineAtCompletion: null },
      new Date(deadline.getTime() + 1),
    ),
    'OVERDUE',
  );
});
