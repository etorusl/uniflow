import { useCallback, useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { RequireSession } from '../features/auth/require-session';
import { loadSubjects, loadTeachers, type Subject, type Teacher } from '../features/study/data';
import { api, ensureSuccess, errorMessage } from '../platform/api';
import { Button, Field, Notice, formStyles } from '../shared/forms';
import { Dialog } from '../shared/dialog';
import { EmptyState, pageStyles } from '../shared/empty-state';
import { colors } from '../shared/theme';

export default function CatalogScreen() {
  return (
    <RequireSession>
      <Catalog />
    </RequireSession>
  );
}
function Catalog() {
  const [subjects, setSubjects] = useState<Subject[]>([]),
    [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'subjects' | 'teachers'>('subjects');
  const [editor, setEditor] = useState<{ kind: 'subjects' | 'teachers'; id?: string } | null>(null);
  const [remove, setRemove] = useState<{
    kind: 'subjects' | 'teachers';
    id: string;
    name: string;
  } | null>(null);
  const [name, setName] = useState(''),
    [color, setColor] = useState('#6554D9'),
    [email, setEmail] = useState(''),
    [phone, setPhone] = useState(''),
    [notes, setNotes] = useState('');
  const reload = useCallback(async () => {
    setError('');
    try {
      const [a, b] = await Promise.all([loadSubjects(), loadTeachers()]);
      setSubjects(a);
      setTeachers(b);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  function edit(kind: 'subjects' | 'teachers', item?: Subject | Teacher) {
    setError('');
    setEditor({ kind, id: item?.id });
    setName(item?.name ?? '');
    setColor(item && 'color' in item ? item.color : '#6554D9');
    setEmail(item && 'email' in item ? (item.email ?? '') : '');
    setPhone(item && 'phone' in item ? (item.phone ?? '') : '');
    setNotes(item && 'notes' in item ? (item.notes ?? '') : '');
  }
  async function save() {
    if (!editor) return;
    setBusy(true);
    setError('');
    try {
      if (editor.kind === 'subjects') {
        const body = { name, color };
        ensureSuccess(
          editor.id
            ? await api.PATCH('/api/v1/subjects/{id}', {
                params: { path: { id: editor.id } },
                body,
              })
            : await api.POST('/api/v1/subjects', { body }),
        );
      } else {
        const body = {
          name,
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        };
        ensureSuccess(
          editor.id
            ? await api.PATCH('/api/v1/teachers/{id}', {
                params: { path: { id: editor.id } },
                body,
              })
            : await api.POST('/api/v1/teachers', { body }),
        );
      }
      setEditor(null);
      await reload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function confirmDelete() {
    if (!remove) return;
    setBusy(true);
    setError('');
    try {
      ensureSuccess(
        remove.kind === 'subjects'
          ? await api.DELETE('/api/v1/subjects/{id}', { params: { path: { id: remove.id } } })
          : await api.DELETE('/api/v1/teachers/{id}', { params: { path: { id: remove.id } } }),
      );
      setRemove(null);
      await reload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const list = tab === 'subjects' ? subjects : teachers;
  return (
    <>
      <View>
        <Text accessibilityRole="header" style={pageStyles.title}>
          Предметы и преподаватели
        </Text>
        <Text style={pageStyles.subtitle}>Всё, из чего складывается ваш семестр.</Text>
      </View>
      <View style={formStyles.row}>
        <Button
          title="Предметы"
          secondary={tab !== 'subjects'}
          onPress={() => setTab('subjects')}
        />
        <Button
          title="Преподаватели"
          secondary={tab !== 'teachers'}
          onPress={() => setTab('teachers')}
        />
        <Button
          title={tab === 'subjects' ? 'Добавить предмет' : 'Добавить преподавателя'}
          onPress={() => edit(tab)}
        />
        <Link href="/schedule" style={formStyles.link}>
          К расписанию →
        </Link>
      </View>
      {!!error && !editor && !remove && <Notice message={error} />}
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : list.length === 0 ? (
        <EmptyState
          title={
            tab === 'subjects'
              ? 'Начните с первого предмета'
              : 'Контакты преподавателей всегда под рукой'
          }
          description="Добавленные записи доступны только вам."
        />
      ) : (
        list.map((item) => (
          <View key={item.id} style={formStyles.card}>
            <View style={formStyles.row}>
              {'color' in item && (
                <View
                  style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: item.color }}
                />
              )}
              <Text style={pageStyles.heading}>{item.name}</Text>
            </View>
            {'email' in item && (
              <Text style={formStyles.muted}>
                {[item.email, item.phone, item.notes].filter(Boolean).join(' · ') ||
                  'Контакты не указаны'}
              </Text>
            )}
            <View style={formStyles.row}>
              <Button title="Изменить" secondary onPress={() => edit(tab, item)} />
              <Button
                title="Удалить"
                secondary
                onPress={() => {
                  setError('');
                  setRemove({ kind: tab, id: item.id, name: item.name });
                }}
              />
            </View>
          </View>
        ))
      )}
      <Dialog
        visible={!!editor}
        title={editor?.kind === 'subjects' ? 'Предмет' : 'Преподаватель'}
        onClose={() => setEditor(null)}
      >
        <Field
          label="Название / имя"
          value={name}
          onChangeText={setName}
          autoCapitalize="sentences"
          maxLength={100}
        />
        {editor?.kind === 'subjects' ? (
          <View style={formStyles.row}>
            {['#6554D9', '#228D75', '#D28B36', '#D76884', '#3F83CF', '#6E7F43'].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Цвет ${value}`}
                onPress={() => setColor(value)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: value,
                  borderWidth: value === color ? 4 : 0,
                  borderColor: colors.ink,
                }}
              />
            ))}
          </View>
        ) : (
          <>
            <Field
              label="Email преподавателя"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <Field label="Телефон" value={phone} onChangeText={setPhone} />
            <Field label="Заметки" value={notes} onChangeText={setNotes} multiline />
          </>
        )}
        {!!error && <Notice message={error} />}
        <Button title="Сохранить" busy={busy} onPress={() => void save()} />
      </Dialog>
      <Dialog visible={!!remove} title="Удалить запись?" onClose={() => setRemove(null)}>
        <Text style={formStyles.muted}>
          {remove?.name}. Действие удалит запись из вашего справочника.
        </Text>
        {!!error && <Notice message={error} />}
        <Button
          title="Подтвердить удаление"
          busy={busy}
          style={{ backgroundColor: colors.danger }}
          onPress={() => void confirmDelete()}
        />
      </Dialog>
    </>
  );
}
