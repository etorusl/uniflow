import { useCallback, useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { components } from '@uniflow/api-client';
import { useAuth } from '../auth/auth-context';
import type { Occurrence } from '../study/data';
import { api, errorMessage, resultData } from '../../platform/api';
import { Button, Notice, formStyles } from '../../shared/forms';
import { EmptyState, pageStyles } from '../../shared/empty-state';
import { colors } from '../../shared/theme';
import { StatisticsCards, type Statistics } from './statistics-cards';

export function TodayDashboard() {
  const { user } = useAuth();
  const zone = user?.timeZone ?? 'UTC';
  const [statistics, setStatistics] = useState<Statistics | null>(null),
    [tasks, setTasks] = useState<components['schemas']['TaskDto'][]>([]),
    [lessons, setLessons] = useState<Occurrence[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const date = DateTime.now().setZone(zone).toISODate()!;
      const [a, b, c] = await Promise.all([
        api.GET('/api/v1/statistics/me').then(resultData),
        api
          .GET('/api/v1/tasks', { params: { query: { status: 'OPEN', page: 1, limit: 4 } } })
          .then(resultData),
        api
          .GET('/api/v1/schedule/occurrences', { params: { query: { from: date, to: date } } })
          .then(resultData),
      ]);
      setStatistics(a);
      setTasks(b.items);
      setLessons(c.items.filter((lesson) => !lesson.cancelled));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [zone]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Ваш день, {user?.displayName}
        </Text>
        <Text style={pageStyles.subtitle}>
          {DateTime.now().setZone(zone).setLocale('ru').toFormat('cccc, d LLLL')} · Планы, которые
          помогают двигаться вперёд.
        </Text>
      </View>
      <View style={formStyles.row}>
        <Link
          href={{ pathname: '/tasks', params: { create: '1' } }}
          style={[
            formStyles.link,
            { backgroundColor: colors.primarySoft, padding: 14, borderRadius: 10 },
          ]}
        >
          ＋ Добавить задание
        </Link>
        <Link href="/subjects" style={formStyles.link}>
          Предметы и преподаватели
        </Link>
        <Link href="/schedule" style={formStyles.link}>
          Моё расписание →
        </Link>
      </View>
      {!!error && (
        <>
          <Notice message={error} />
          <Button secondary title="Повторить загрузку" onPress={() => void reload()} />
        </>
      )}
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          {statistics && <StatisticsCards value={statistics} />}
          <View>
            <Text style={pageStyles.heading}>Сегодня в расписании</Text>
            {lessons.length ? (
              lessons.map((lesson) => (
                <View
                  key={lesson.id}
                  style={[
                    formStyles.card,
                    { marginBottom: 12, borderLeftWidth: 4, borderLeftColor: lesson.color },
                  ]}
                >
                  <Text style={{ fontWeight: '700', color: colors.primary }}>
                    {DateTime.fromISO(lesson.startsAt).setZone(zone).toFormat('HH:mm')}–
                    {DateTime.fromISO(lesson.endsAt).setZone(zone).toFormat('HH:mm')}
                  </Text>
                  <Text style={pageStyles.heading}>{lesson.subjectName}</Text>
                  <Text style={formStyles.muted}>
                    {[lesson.teacherName, lesson.room && `Ауд. ${lesson.room}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))
            ) : (
              <EmptyState
                title="Сегодня пар нет"
                description="Можно заняться заданиями или настроить расписание на семестр."
                symbol="▦"
              />
            )}
          </View>
          <View>
            <Text style={pageStyles.heading}>Ближайшие дедлайны</Text>
            {tasks.length ? (
              tasks.map((task) => (
                <Link key={task.id} href="/tasks" asChild>
                  <Pressable
                    accessibilityRole="link"
                    style={{ ...formStyles.card, width: '100%', marginBottom: 12 }}
                  >
                    <Text style={pageStyles.heading}>{task.title}</Text>
                    <Text
                      style={[
                        formStyles.muted,
                        task.status === 'OVERDUE' && { color: colors.danger },
                      ]}
                    >
                      {task.status === 'OVERDUE' ? 'Просрочено · ' : ''}
                      {DateTime.fromISO(task.dueAt)
                        .setZone(zone)
                        .setLocale('ru')
                        .toFormat('d LLL, HH:mm')}{' '}
                      · {task.subjectName ?? 'Без предмета'}
                    </Text>
                  </Pressable>
                </Link>
              ))
            ) : (
              <EmptyState
                title="Всё под контролем"
                description="Открытых заданий пока нет. Добавьте первое, когда появится новый дедлайн."
                symbol="☑"
              />
            )}
          </View>
        </>
      )}
    </>
  );
}
