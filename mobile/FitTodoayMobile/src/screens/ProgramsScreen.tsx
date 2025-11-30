import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../components/Screen';
import {
  ProgramFolder,
  TemplateSummary,
  TemplateExerciseSummary,
  fetchProgramFolders,
  updateFolder,
  createFolder,
  fetchTemplates,
  createTemplate,
  deleteFolder,
  ExerciseOption,
  fetchExercises,
  createTemplateExercise,
  reorderTemplateExercises,
  fetchTemplateDetail,
  updateTemplate,
  deleteTemplate,
  fetchTemplateExercise,
  updateTemplateExercise,
  deleteTemplateExercise,
} from '../api/programs';
import {
  applyThreadActions,
  createThread,
  fetchThreadMessages,
  sendThreadMessage,
} from '../api/assistant';
import { useToken } from '../hooks/useToken';
import { notifyError, notifySuccess } from '../utils/notify';
import { useThemedColors } from '../theme/colors';
import { PrimaryButton } from '../components/PrimaryButton';
import { config } from '../config/env';

const WEEK_DAYS = [
  { value: 0, label: 'Пн' },
  { value: 1, label: 'Вт' },
  { value: 2, label: 'Ср' },
  { value: 3, label: 'Чт' },
  { value: 4, label: 'Пт' },
  { value: 5, label: 'Сб' },
  { value: 6, label: 'Вс' },
];

const STATIC_BASE_URL = config.apiUrl?.replace(/\/$/, '') || '';
const buildExerciseImageUrl = (path?: string) => {
  if (!path) return '';
  const encodedPath = path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return `${STATIC_BASE_URL}/static/${encodedPath}`;
};

let DraggableFlatList: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DraggableFlatList = require('react-native-draggable-flatlist').default;
} catch {
  DraggableFlatList = null;
}

export function ProgramsScreen() {
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const token = useToken();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [folderModal, setFolderModal] = useState<{ visible: boolean; folder: ProgramFolder | null; name: string; comment: string }>({ visible: false, folder: null, name: '', comment: '' });
  const [templateModal, setTemplateModal] = useState<{
    visible: boolean;
    folderId: number | null;
    name: string;
    comment: string;
    templateId?: number | null;
  }>({ visible: false, folderId: null, name: '', comment: '', templateId: null });
  const [exerciseModal, setExerciseModal] = useState<{
    visible: boolean;
    templateId: number | null;
    templateName?: string;
    exerciseId?: number | null;
    exercise?: TemplateExerciseSummary | null;
  }>({ visible: false, templateId: null, exerciseId: null, exercise: null });
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedExercise, setSelectedExercise] = useState<ExerciseOption | null>(null);
  const [exerciseForm, setExerciseForm] = useState<{ reps: string; sets: string; weight: string; time: string; rest: string; note: string; is_active: boolean }>({ reps: '', sets: '', weight: '', time: '', rest: '', note: '', is_active: true });
  const [templateForm, setTemplateForm] = useState<{ name: string; comment: string; schedule_type: 'weekly' | 'biweekly' | 'interval' | 'custom'; schedule_config: any }>({
    name: '',
    comment: '',
    schedule_type: 'weekly',
    schedule_config: { days_of_week: [0] },
  });
  const [chatModal, setChatModal] = useState<{
    open: boolean;
    folder?: ProgramFolder | null;
    threadId?: number | null;
    input: string;
    sending: boolean;
    applying: boolean;
    messages: { id: number; role: string; content: string; actions?: any }[];
    error?: string | null;
  }>({ open: false, folder: null, threadId: null, input: '', sending: false, applying: false, messages: [], error: null });
  const [exerciseMeta, setExerciseMeta] = useState<{ hasTime: boolean; hasWeight: boolean }>({ hasTime: false, hasWeight: true });

  const isProtectedFolder = (name?: string) => {
    const normalized = (name || '').trim().toLowerCase();
    return normalized === 'основная' || normalized === 'основные';
  };

  const parseMuscles = (value?: string | null) =>
    (value || '')
      .split(/[\\/,-]/)
      .map(item => item.trim())
      .filter(Boolean);

  const collectTemplateMuscles = (template: TemplateSummary) => {
    const seen = new Set<string>();
    (template.template_exercises || []).forEach(ex => {
      const muscles = ex.exercise?.target_muscles || ex.custom_exercise?.target_muscles || '';
      parseMuscles(muscles).forEach(m => {
        if (!seen.has(m)) seen.add(m);
      });
    });
    return Array.from(seen);
  };

  const { data: folders, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['programFolders'],
    queryFn: () => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return fetchProgramFolders(token);
    },
    enabled: Boolean(token),
    onError: (err: any) => {
      notifyError(err?.message || 'Не удалось загрузить программы');
    },
  });

  const folderMutation = useMutation({
    mutationFn: (payload: Partial<ProgramFolder> & { id?: number }) => {
      if (!token) throw new Error('Нет токена');
      if (payload.id) {
        return updateFolder(token, payload.id, payload);
      }
      return createFolder(token, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programFolders'] });
      notifySuccess('Сохранено');
      setFolderModal({ visible: false });
    },
    onError: (err: any) => notifyError(err?.message || 'Не удалось сохранить программу'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      if (!token) throw new Error('Нет токена');
      return deleteFolder(token, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programFolders'] });
      notifySuccess('Удалено');
    },
    onError: (err: any) => notifyError(err?.message || 'Не удалось удалить программу'),
  });

  const templateMutation = useMutation({
    mutationFn: (payload: { folder: number; name: string; comment?: string }) => {
      if (!token) throw new Error('Нет токена');
      return createTemplate(token, {
        folder: payload.folder,
        name: payload.name,
        comment: payload.comment,
        schedule_type: templateForm.schedule_type,
        schedule_config: templateForm.schedule_config,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['templates', variables.folder] });
      notifySuccess('Шаблон создан');
      setTemplateModal({ visible: false, folderId: null, name: '', comment: '', templateId: null });
      setTemplateForm({ name: '', comment: '', schedule_type: 'weekly', schedule_config: { days_of_week: [0] } });
    },
    onError: (err: any) => notifyError(err?.message || 'Не удалось создать шаблон'),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: (payload: { id: number; folderId: number }) => {
      if (!token) throw new Error('Нет токена');
      return updateTemplate(token, payload.id, {
        name: templateForm.name,
        comment: templateForm.comment,
        schedule_type: templateForm.schedule_type,
        schedule_config: templateForm.schedule_config,
      });
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['templates', variables.folderId] });
      notifySuccess('Шаблон сохранён');
      setTemplateModal({ visible: false, folderId: null, name: '', comment: '', templateId: null });
    },
    onError: (err: any) => notifyError(err?.message || 'Не удалось сохранить шаблон'),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (payload: { id: number; folderId: number }) => {
      if (!token) throw new Error('Нет токена');
      return deleteTemplate(token, payload.id);
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['templates', variables.folderId] });
      notifySuccess('Шаблон удалён');
      setTemplateModal({ visible: false, folderId: null, name: '', comment: '', templateId: null });
    },
    onError: (err: any) => notifyError(err?.message || 'Не удалось удалить шаблон'),
  });

  const { data: searchExercises } = useQuery({
    queryKey: ['exercises', search],
    queryFn: () => {
      if (!token) throw new Error('Нет токена');
      return fetchExercises(token, search);
    },
    enabled: Boolean(token) && search.length > 1,
  });

  const addExerciseMutation = useMutation({
    mutationFn: (payload: { template: number; exercise_id: number }) => {
      if (!token) throw new Error('Нет токена');
      return createTemplateExercise(token, {
        template: payload.template,
        exercise_id: payload.exercise_id,
        rep_override: exerciseForm.reps ? Number(exerciseForm.reps) : null,
        set_override: exerciseForm.sets ? Number(exerciseForm.sets) : null,
        weight_override: exerciseMeta.hasWeight ? (exerciseForm.weight ? Number(exerciseForm.weight) : null) : null,
        time_override: exerciseMeta.hasTime ? (exerciseForm.time ? Number(exerciseForm.time) : null) : null,
        rest_override: exerciseForm.rest ? Number(exerciseForm.rest) : null,
        note: exerciseForm.note || null,
        is_active: exerciseForm.is_active,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['templates', selectedFolderId || variables.template] });
      notifySuccess('Упражнение добавлено');
      setExerciseModal({ visible: false, templateId: null });
      setSelectedExercise(null);
      setSearch('');
    },
    onError: (err: any) => notifyError(err?.message || 'Не удалось добавить упражнение'),
  });

  const updateExerciseMutation = useMutation({
    mutationFn: (payload: { id: number; templateId: number }) => {
      if (!token) throw new Error('Нет токена');
      return updateTemplateExercise(token, payload.id, {
        exercise_id: selectedExercise?.id,
        rep_override: exerciseForm.reps ? Number(exerciseForm.reps) : null,
        set_override: exerciseForm.sets ? Number(exerciseForm.sets) : null,
        weight_override: exerciseForm.weight ? Number(exerciseForm.weight) : null,
        time_override: exerciseForm.time ? Number(exerciseForm.time) : null,
        rest_override: exerciseForm.rest ? Number(exerciseForm.rest) : null,
        note: exerciseForm.note || null,
        is_active: exerciseForm.is_active,
      });
    },
    onSuccess: (_d, _variables) => {
      if (selectedFolderId) {
        queryClient.invalidateQueries({ queryKey: ['templates', selectedFolderId] });
      }
      notifySuccess('Упражнение сохранено');
      setExerciseModal({ visible: false, templateId: null, exerciseId: null, exercise: null });
      setSelectedExercise(null);
      setSearch('');
    },
    onError: (err: any) => notifyError(err?.message || 'Не удалось сохранить упражнение'),
  });

  const deleteExerciseMutation = useMutation({
    mutationFn: (payload: { id: number; templateId: number }) => {
      if (!token) throw new Error('Нет токена');
      return deleteTemplateExercise(token, payload.id);
    },
    onSuccess: (_d, _variables) => {
      if (selectedFolderId) {
        queryClient.invalidateQueries({ queryKey: ['templates', selectedFolderId] });
      }
      notifySuccess('Упражнение удалено');
      setExerciseModal({ visible: false, templateId: null, exerciseId: null, exercise: null });
      setSelectedExercise(null);
      setSearch('');
    },
    onError: (err: any) => notifyError(err?.message || 'Не удалось удалить упражнение'),
  });

  React.useEffect(() => {
    if (templateModal.visible && templateModal.templateId && token) {
      fetchTemplateDetail(token, templateModal.templateId)
        .then(detail => {
          setTemplateForm({
            name: detail.name,
            comment: detail.comment,
            schedule_type: (detail.schedule_type as any) || 'weekly',
            schedule_config: detail.schedule_config || { days_of_week: [0] },
          });
        })
        .catch(() => notifyError('Не удалось загрузить шаблон'));
    } else if (!templateModal.visible) {
      setTemplateForm({ name: '', comment: '', schedule_type: 'weekly', schedule_config: { days_of_week: [0] } });
    }
  }, [templateModal, token]);

  React.useEffect(() => {
    if (exerciseModal.visible && exerciseModal.exerciseId && token) {
      fetchTemplateExercise(token, exerciseModal.exerciseId)
        .then(detail => {
          setExerciseForm({
            reps: detail.rep_override !== null && detail.rep_override !== undefined ? String(detail.rep_override) : '',
            sets: detail.set_override !== null && detail.set_override !== undefined ? String(detail.set_override) : '',
            weight: detail.weight_override !== null && detail.weight_override !== undefined ? String(detail.weight_override) : '',
            time: detail.time_override !== null && detail.time_override !== undefined ? String(detail.time_override) : '',
            rest: detail.rest_override !== null && detail.rest_override !== undefined ? String(detail.rest_override) : '',
            note: detail.note || '',
            is_active: detail.is_active,
          });
          setSelectedExercise(detail.exercise || null);
          setExerciseMeta({
            hasTime: Boolean(detail.exercise?.has_time),
            hasWeight: detail.exercise?.has_weight !== false,
          });
        })
        .catch(() => notifyError('Не удалось загрузить упражнение'));
    } else if (!exerciseModal.visible) {
      setExerciseForm({ reps: '', sets: '', weight: '', time: '', rest: '', note: '', is_active: true });
      setSelectedExercise(null);
      setExerciseMeta({ hasTime: false, hasWeight: true });
    }
  }, [exerciseModal, token]);

  const reorderMutation = useMutation({
    mutationFn: (payload: { templateId: number; order: number[]; folderId: number }) => {
      if (!token) throw new Error('Нет токена');
      return reorderTemplateExercises(token, payload.templateId, payload.order);
    },
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['templates', variables.folderId] });
    },
  });

  const openChat = async (folder: ProgramFolder) => {
    if (!token) {
      notifyError('Нет токена');
      return;
    }
    try {
      const thread = await createThread(token, folder.id, `Чат по: ${folder.name}`);
      setChatModal(prev => ({ ...prev, open: true, folder, threadId: thread.id, messages: [], input: '', error: null }));
      const msgs = await fetchThreadMessages(token, thread.id);
      setChatModal(prev => ({ ...prev, messages: msgs }));
    } catch (e: any) {
      const msg = e?.message || 'Не удалось открыть чат';
      notifyError(msg);
      setChatModal(prev => ({ ...prev, open: true, folder, threadId: null, error: msg }));
    }
  };

  const sendChat = async () => {
    if (!token || !chatModal.threadId || !chatModal.input.trim()) return;
    setChatModal(prev => ({ ...prev, sending: true }));
    try {
      await sendThreadMessage(token, chatModal.threadId, chatModal.input.trim());
      const msgs = await fetchThreadMessages(token, chatModal.threadId);
      setChatModal(prev => ({ ...prev, messages: msgs, input: '' }));
    } catch (e: any) {
      notifyError(e?.message || 'Не удалось отправить сообщение');
    } finally {
      setChatModal(prev => ({ ...prev, sending: false }));
    }
  };

  const applyChat = async () => {
    if (!token || !chatModal.threadId) return;
    setChatModal(prev => ({ ...prev, applying: true }));
    try {
      await applyThreadActions(token, chatModal.threadId);
      notifySuccess('Изменения применены');
      queryClient.invalidateQueries({ queryKey: ['programFolders'] });
      if (selectedFolderId) {
        queryClient.invalidateQueries({ queryKey: ['templates', selectedFolderId] });
      }
      setChatModal(prev => ({ ...prev, open: false, threadId: null, messages: [] }));
    } catch (e: any) {
      notifyError(e?.message || 'Не удалось применить изменения');
    } finally {
      setChatModal(prev => ({ ...prev, applying: false }));
    }
  };

  const renderTemplate = (template: TemplateSummary, folderId: number) => {
    const exercises = template.template_exercises || [];
    const muscles = collectTemplateMuscles(template);

    const renderExerciseItem = ({ item, drag, isActive }: any) => (
      <Pressable
        onLongPress={drag}
        delayLongPress={120}
        style={[
          styles.exerciseRow,
          isActive && { backgroundColor: colors.surfaceMuted, opacity: 0.8 },
        ]}
        onPress={() => {
          setExerciseModal({ visible: true, templateId: template.id, templateName: template.name, exerciseId: item.id, exercise: item });
          setSelectedExercise(item.exercise || item.custom_exercise || null);
        }}
      >
        <View>
          <Text style={styles.exerciseName}>
            {item.exercise?.name || item.custom_exercise?.name || 'Упражнение'}
          </Text>
          {item.note ? <Text style={styles.muted}>{item.note}</Text> : null}
        </View>
        <Text style={styles.dragHandle}>≡</Text>
      </Pressable>
    );

    const handleDragEnd = ({ data }: any) => {
      const order = data.map((ex: any) => ex.id);
      reorderMutation.mutate({ templateId: template.id, order, folderId });
    };

    return (
      <View key={template.id} style={styles.templateCard}>
        <View style={styles.templateHeader}>
          <Text style={styles.templateTitle}>{template.name}</Text>
          {template.comment ? <Text style={styles.templateComment}>{template.comment}</Text> : null}
          {muscles.length ? <Text style={styles.muted}>Мышцы: {muscles.slice(0, 4).join(' • ')}{muscles.length > 4 ? ' …' : ''}</Text> : null}
          <View style={styles.actionsRow}>
            <PrimaryButton
              title="Настроить"
              variant="ghost"
              onPress={() => setTemplateModal({
                visible: true,
                folderId,
                templateId: template.id,
                name: template.name,
                comment: template.comment || '',
              })}
            />
            <PrimaryButton
              title="Удалить шаблон"
              variant="ghost"
              onPress={() => deleteTemplateMutation.mutate({ id: template.id, folderId })}
              disabled={deleteTemplateMutation.isPending}
            />
          </View>
        </View>
        <View style={styles.exerciseList}>
          {exercises.length === 0 ? (
            <Text style={styles.muted}>Упражнений нет</Text>
          ) : DraggableFlatList ? (
            <DraggableFlatList
              data={exercises}
              keyExtractor={item => String(item.id)}
              renderItem={renderExerciseItem}
              onDragEnd={handleDragEnd}
              containerStyle={{ gap: 6 }}
            />
          ) : (
            exercises.map((ex: any, idx: number) => renderExerciseItem({ item: ex, drag: () => null, isActive: false, index: idx }))
          )}
        </View>
        <PrimaryButton
          title="Добавить упражнение"
          variant="ghost"
          onPress={() => setExerciseModal({ visible: true, templateId: template.id, templateName: template.name })}
        />
      </View>
    );
  };

  const TemplateBlock = ({ folderId }: { folderId: number }) => {
    const { data, isFetching: templatesFetching } = useQuery({
      queryKey: ['templates', folderId],
      queryFn: () => {
        if (!token) throw new Error('Нет токена');
        return fetchTemplates(token, folderId);
      },
      enabled: expanded[folderId],
    });

    return (
      <View style={{ gap: 8 }}>
        {templatesFetching && <Text style={styles.muted}>Загружаем шаблоны...</Text>}
        {(data || []).map(template => renderTemplate(template, folderId))}
        <PrimaryButton
          title="Новый шаблон"
          onPress={() => setTemplateModal({ visible: true, folderId, name: '', comment: '' })}
          variant="ghost"
        />
      </View>
    );
  };

  const renderItem = ({ item }: { item: ProgramFolder }) => {
    const isExpanded = expanded[item.id];
    return (
      <View style={[styles.card, !item.is_active && styles.cardInactive]}>
        <Pressable
          style={styles.cardHeader}
          onPress={() => {
            setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }));
            setSelectedFolderId(item.id);
          }}
        >
          <View>
            <Text style={styles.cardTitle}>{item.name}</Text>
            {item.comment ? <Text style={styles.cardDescription}>{item.comment}</Text> : null}
          </View>
          <View style={styles.badges}>
            {!item.is_active ? <Text style={styles.badge}>Не активна</Text> : null}
            <Text style={styles.chevron}>{isExpanded ? '▾' : '▸'}</Text>
          </View>
        </Pressable>
        {isExpanded && (
          <View style={{ gap: 12 }}>
            <View style={styles.actionsRow}>
              <PrimaryButton
                title={item.is_active ? 'Выключить' : 'Включить'}
                variant="ghost"
                onPress={() => folderMutation.mutate({ id: item.id, is_active: !item.is_active })}
              />
              <PrimaryButton
                title="Редактировать"
                variant="ghost"
                onPress={() => setFolderModal({ visible: true, folder: item, name: item.name, comment: item.comment || '' })}
              />
            <PrimaryButton
              title="Удалить"
              variant="ghost"
              onPress={() => {
                if (isProtectedFolder(item.name)) {
                  notifyError('Эту программу нельзя удалить');
                  return;
                }
                deleteMutation.mutate(item.id);
              }}
              disabled={isProtectedFolder(item.name)}
            />
            <PrimaryButton
              title="Обсудить с ассистентом"
              variant="ghost"
              onPress={() => openChat(item)}
            />
          </View>
          <TemplateBlock folderId={item.id} />
          </View>
        )}
      </View>
    );
  };

  const folderForm = folderModal.folder || { name: folderModal.name, comment: folderModal.comment, is_active: true };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Программы</Text>
        <Text style={styles.subtitle}>
          Управляйте папками, шаблонами и упражнениями.
        </Text>
        <PrimaryButton title="Новая программа" onPress={() => setFolderModal({ visible: true, folder: null, name: '', comment: '' })} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f2b200" />
        </View>
      ) : (
        <FlatList
          data={folders || []}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#f2b200" />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<Text style={styles.empty}>Нет программ</Text>}
        />
      )}

      <Modal transparent visible={folderModal.visible} animationType="fade" onRequestClose={() => setFolderModal({ visible: false, folder: null, name: '', comment: '' })}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{folderModal.folder ? 'Редактирование программы' : 'Новая программа'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Название"
              placeholderTextColor="#7c8494"
              value={folderModal.name || folderForm.name}
              onChangeText={value => setFolderModal(prev => ({ ...prev, name: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Комментарий"
              placeholderTextColor="#7c8494"
              value={folderModal.comment || ''}
              onChangeText={value => setFolderModal(prev => ({ ...prev, comment: value }))}
            />
            <View style={styles.actionsRow}>
              <PrimaryButton title="Отмена" variant="ghost" onPress={() => setFolderModal({ visible: false, folder: null, name: '', comment: '' })} />
              <PrimaryButton
                title="Сохранить"
                onPress={() =>
                  folderMutation.mutate({
                    id: folderModal.folder?.id,
                    name: folderModal.name || folderForm.name,
                    comment: folderModal.comment || folderForm.comment,
                    is_active: folderForm.is_active ?? true,
                  })
                }
                loading={folderMutation.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={chatModal.open} animationType="fade" onRequestClose={() => setChatModal(prev => ({ ...prev, open: false }))}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <Text style={styles.modalTitle}>
              {chatModal.folder ? `Чат ассистента: ${chatModal.folder.name}` : 'Чат ассистента'}
            </Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {chatModal.messages.length === 0 ? (
                <Text style={styles.muted}>Сообщений пока нет. Сформулируйте задачу.</Text>
              ) : (
                chatModal.messages.map(msg => (
                  <View key={msg.id} style={{ marginBottom: 10 }}>
                    <Text style={styles.muted}>{msg.role === 'assistant' ? 'Ассистент' : 'Вы'}</Text>
                    <Text style={styles.cardDescription}>{msg.content}</Text>
                    {msg.actions && Array.isArray(msg.actions) && msg.actions.length > 0 ? (
                      <Text style={styles.muted}>Ассистент предложил {msg.actions.length} действий</Text>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
            <TextInput
              style={styles.input}
              placeholder="Напишите, что изменить в программе"
              placeholderTextColor="#7c8494"
              value={chatModal.input}
              onChangeText={value => setChatModal(prev => ({ ...prev, input: value }))}
            />
            <View style={styles.actionsRow}>
              <PrimaryButton title="Закрыть" variant="ghost" onPress={() => setChatModal(prev => ({ ...prev, open: false }))} />
              <PrimaryButton
                title="Применить"
                onPress={applyChat}
                disabled={!chatModal.threadId}
                loading={chatModal.applying}
              />
              <PrimaryButton
                title="Отправить"
                onPress={sendChat}
                disabled={!chatModal.input.trim()}
                loading={chatModal.sending}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={templateModal.visible} animationType="fade" onRequestClose={() => setTemplateModal({ visible: false, folderId: null, name: '', comment: '' })}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{templateModal.templateId ? 'Настройка шаблона' : 'Новый шаблон'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Название дня"
              placeholderTextColor="#7c8494"
              value={templateModal.name}
              onChangeText={value => {
                setTemplateModal(prev => ({ ...prev, name: value }));
                setTemplateForm(prev => ({ ...prev, name: value }));
              }}
            />
            <TextInput
              style={styles.input}
              placeholder="Комментарий"
              placeholderTextColor="#7c8494"
              value={templateModal.comment}
              onChangeText={value => {
                setTemplateModal(prev => ({ ...prev, comment: value }));
                setTemplateForm(prev => ({ ...prev, comment: value }));
              }}
            />
            <View style={{ gap: 8 }}>
              <Text style={styles.muted}>Тип расписания</Text>
              <View style={styles.actionsRow}>
                {['weekly', 'biweekly', 'interval', 'custom'].map(option => (
                  <Pressable
                    key={option}
                    style={[
                      styles.chip,
                      templateForm.schedule_type === option && styles.chipActive,
                    ]}
                    onPress={() => {
                      setTemplateForm(prev => ({
                        ...prev,
                        schedule_type: option as any,
                        schedule_config:
                          option === 'weekly'
                            ? { days_of_week: [0] }
                            : option === 'biweekly'
                              ? { start_date: new Date().toISOString().slice(0, 10), week_interval: 2, days_of_week: [0] }
                              : option === 'interval'
                                ? { start_date: new Date().toISOString().slice(0, 10), every_x_days: 2 }
                                : { specific_dates: [] },
                      }));
                    }}
                  >
                    <Text style={[styles.chipText, templateForm.schedule_type === option && styles.chipTextActive]}>
                      {option === 'weekly' ? 'Еженедельно' : option === 'biweekly' ? 'Раз в N недель' : option === 'interval' ? 'Через X дней' : 'Даты'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {templateForm.schedule_type === 'weekly' && (
                <View style={styles.actionsRow}>
                  {WEEK_DAYS.map(day => {
                    const selected = (templateForm.schedule_config?.days_of_week || []).includes(day.value);
                    return (
                      <Pressable
                        key={day.value}
                        style={[styles.chip, selected && styles.chipActive]}
                        onPress={() => {
                          const current = templateForm.schedule_config?.days_of_week || [];
                          const next = selected ? current.filter((d: number) => d !== day.value) : [...current, day.value];
                          setTemplateForm(prev => ({ ...prev, schedule_config: { ...prev.schedule_config, days_of_week: next } }));
                        }}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>{day.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {templateForm.schedule_type === 'biweekly' && (
                <View style={{ gap: 8 }}>
                  <TextInput
                    style={styles.input}
                    placeholder="Дата старта (ГГГГ-ММ-ДД)"
                    placeholderTextColor="#7c8494"
                    value={templateForm.schedule_config?.start_date || ''}
                    onChangeText={value => setTemplateForm(prev => ({ ...prev, schedule_config: { ...prev.schedule_config, start_date: value } }))}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Интервал недель"
                    placeholderTextColor="#7c8494"
                    keyboardType="numeric"
                    value={String(templateForm.schedule_config?.week_interval || '')}
                    onChangeText={value => setTemplateForm(prev => ({ ...prev, schedule_config: { ...prev.schedule_config, week_interval: Number(value) || 1 } }))}
                  />
                  <View style={styles.actionsRow}>
                    {WEEK_DAYS.map(day => {
                      const selected = (templateForm.schedule_config?.days_of_week || []).includes(day.value);
                      return (
                        <Pressable
                          key={day.value}
                          style={[styles.chip, selected && styles.chipActive]}
                          onPress={() => {
                            const current = templateForm.schedule_config?.days_of_week || [];
                            const next = selected ? current.filter((d: number) => d !== day.value) : [...current, day.value];
                            setTemplateForm(prev => ({ ...prev, schedule_config: { ...prev.schedule_config, days_of_week: next } }));
                          }}
                        >
                          <Text style={[styles.chipText, selected && styles.chipTextActive]}>{day.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
              {templateForm.schedule_type === 'interval' && (
                <View style={{ gap: 8 }}>
                  <TextInput
                    style={styles.input}
                    placeholder="Дата старта (ГГГГ-ММ-ДД)"
                    placeholderTextColor="#7c8494"
                    value={templateForm.schedule_config?.start_date || ''}
                    onChangeText={value => setTemplateForm(prev => ({ ...prev, schedule_config: { ...prev.schedule_config, start_date: value } }))}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Каждые X дней"
                    placeholderTextColor="#7c8494"
                    keyboardType="numeric"
                    value={String(templateForm.schedule_config?.every_x_days || '')}
                    onChangeText={value => setTemplateForm(prev => ({ ...prev, schedule_config: { ...prev.schedule_config, every_x_days: Number(value) || 1 } }))}
                  />
                </View>
              )}
              {templateForm.schedule_type === 'custom' && (
                <TextInput
                  style={styles.input}
                  placeholder="Даты через запятую (ГГГГ-ММ-ДД)"
                  placeholderTextColor="#7c8494"
                  value={(templateForm.schedule_config?.specific_dates || []).join(', ')}
                  onChangeText={value => setTemplateForm(prev => ({ ...prev, schedule_config: { specific_dates: value.split(',').map(v => v.trim()).filter(Boolean) } }))}
                />
              )}
            </View>
            <View style={styles.actionsRow}>
              <PrimaryButton title="Отмена" variant="ghost" onPress={() => setTemplateModal({ visible: false, folderId: null, name: '', comment: '', templateId: null })} />
              <PrimaryButton
                title={templateModal.templateId ? 'Сохранить' : 'Создать'}
                onPress={() => {
                  if (!templateModal.folderId) return;
                  const name = templateModal.name || 'Шаблон дня';
                  if (templateModal.templateId) {
                    updateTemplateMutation.mutate({ id: templateModal.templateId, folderId: templateModal.folderId });
                  } else {
                    templateMutation.mutate({ folder: templateModal.folderId, name, comment: templateModal.comment });
                  }
                }}
                loading={templateMutation.isPending || updateTemplateMutation.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={exerciseModal.visible}
        animationType="fade"
        onRequestClose={() => {
          setExerciseModal({ visible: false, templateId: null, exerciseId: null, exercise: null });
          setSearch('');
          setSelectedExercise(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardLarge}>
            <Text style={styles.modalTitle}>Добавить упражнение {exerciseModal.templateName ? `в ${exerciseModal.templateName}` : ''}</Text>
            <TextInput
              style={styles.input}
              placeholder="Поиск по каталогу"
              placeholderTextColor="#7c8494"
              value={search}
              onChangeText={setSearch}
            />
            <ScrollView style={{ maxHeight: 240 }}>
              {(searchExercises || []).map(option => (
                <Pressable
                  key={option.id}
                  style={[
                    styles.exerciseOption,
                    selectedExercise?.id === option.id && styles.exerciseOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedExercise(option);
                    setExerciseMeta({ hasTime: Boolean(option.has_time), hasWeight: option.has_weight !== false });
                    setExerciseForm(prev => ({
                      ...prev,
                      reps: option.default_reps ? String(option.default_reps) : '',
                      sets: option.default_sets ? String(option.default_sets) : '',
                      weight: option.default_weight ? String(option.default_weight) : '',
                      time: option.default_time ? String(option.default_time) : '',
                      rest: option.default_rest ? String(option.default_rest) : '',
                    }));
                  }}
                >
                  <Text style={styles.exerciseName}>{option.name}</Text>
                  {option.target_muscles ? (
                    <Text style={styles.muted}>{option.target_muscles}</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
            {selectedExercise && (
              <View style={styles.previewCard}>
                <Text style={styles.exerciseName}>{selectedExercise.name}</Text>
                {selectedExercise.target_muscles ? (
                  <Text style={styles.muted}>Мышцы: {selectedExercise.target_muscles}</Text>
                ) : null}
                <Text style={styles.muted}>
                  {selectedExercise.has_time ? `Время: ${selectedExercise.default_time ?? '—'} сек` : `Повторы: ${selectedExercise.default_reps ?? '—'} · Вес: ${selectedExercise.default_weight ?? '—'} кг`}
                </Text>
                {selectedExercise.description ? (
                  <Text style={styles.muted} numberOfLines={4}>
                    {typeof selectedExercise.description === 'string'
                      ? selectedExercise.description
                      : selectedExercise.description?.text || ''}
                  </Text>
                ) : null}
                {selectedExercise.images?.length ? (
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    style={{ marginTop: 8 }}
                  >
                    {selectedExercise.images.map(img => (
                      <Image
                        key={img.order}
                        source={{ uri: buildExerciseImageUrl(img.path) }}
                        style={styles.previewImage}
                        resizeMode="contain"
                      />
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            )}
            <View style={styles.actionsRow}>
              <TextInput
                style={styles.input}
                placeholder="Сеты"
                placeholderTextColor="#7c8494"
                keyboardType="numeric"
                value={exerciseForm.sets}
                onChangeText={value => setExerciseForm(prev => ({ ...prev, sets: value }))}
              />
              {!exerciseMeta.hasTime && (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Повторы"
                    placeholderTextColor="#7c8494"
                    keyboardType="numeric"
                    value={exerciseForm.reps}
                    onChangeText={value => setExerciseForm(prev => ({ ...prev, reps: value }))}
                  />
                  {exerciseMeta.hasWeight && (
                    <TextInput
                      style={styles.input}
                      placeholder="Вес (кг)"
                      placeholderTextColor="#7c8494"
                      keyboardType="numeric"
                      value={exerciseForm.weight}
                      onChangeText={value => setExerciseForm(prev => ({ ...prev, weight: value }))}
                    />
                  )}
                </>
              )}
              {exerciseMeta.hasTime && (
                <TextInput
                  style={styles.input}
                  placeholder="Время (сек)"
                  placeholderTextColor="#7c8494"
                  keyboardType="numeric"
                  value={exerciseForm.time}
                  onChangeText={value => setExerciseForm(prev => ({ ...prev, time: value }))}
                />
              )}
              <TextInput
                style={styles.input}
                placeholder="Отдых (сек)"
                placeholderTextColor="#7c8494"
                keyboardType="numeric"
                value={exerciseForm.rest}
                onChangeText={value => setExerciseForm(prev => ({ ...prev, rest: value }))}
              />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Комментарий"
              placeholderTextColor="#7c8494"
              value={exerciseForm.note}
              onChangeText={value => setExerciseForm(prev => ({ ...prev, note: value }))}
            />
            <Pressable
              style={[styles.chip, exerciseForm.is_active && styles.chipActive]}
              onPress={() => setExerciseForm(prev => ({ ...prev, is_active: !prev.is_active }))}
            >
              <Text style={[styles.chipText, exerciseForm.is_active && styles.chipTextActive]}>
                {exerciseForm.is_active ? 'Активно' : 'Не активно'}
              </Text>
            </Pressable>
            <View style={styles.actionsRow}>
              <PrimaryButton
                title="Отмена"
                variant="ghost"
                onPress={() => {
                  setExerciseModal({ visible: false, templateId: null, exerciseId: null, exercise: null });
                  setSelectedExercise(null);
                  setSearch('');
                }}
              />
              <PrimaryButton
                title={exerciseModal.exerciseId ? 'Сохранить' : 'Добавить'}
                onPress={() => {
                  if (!exerciseModal.templateId || !selectedExercise) return;
                  if (exerciseModal.exerciseId) {
                    updateExerciseMutation.mutate({ id: exerciseModal.exerciseId, templateId: exerciseModal.templateId });
                  } else {
                    addExerciseMutation.mutate({ template: exerciseModal.templateId, exercise_id: selectedExercise.id });
                  }
                }}
                loading={addExerciseMutation.isPending || updateExerciseMutation.isPending}
              />
              {exerciseModal.exerciseId ? (
                <PrimaryButton
                  title="Удалить"
                  variant="ghost"
                  onPress={() => deleteExerciseMutation.mutate({ id: exerciseModal.exerciseId!, templateId: exerciseModal.templateId! })}
                  loading={deleteExerciseMutation.isPending}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
  header: {
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  cardInactive: {
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 18,
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 14,
  },
  badge: {
    color: colors.primary,
    fontSize: 12,
  },
  badges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  chevron: {
    color: colors.muted,
    fontSize: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.danger,
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 12,
  },
  templateCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    gap: 8,
  },
  templateHeader: {
    gap: 2,
  },
  templateTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  templateComment: {
    color: colors.muted,
    fontSize: 13,
  },
  exerciseList: {
    gap: 6,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseName: {
    color: colors.text,
    fontWeight: '600',
  },
  reorder: {
    flexDirection: 'row',
    gap: 8,
  },
  reorderBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  reorderText: {
    color: colors.text,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  muted: {
    color: colors.muted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    backgroundColor: colors.card,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCardLarge: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    backgroundColor: colors.card,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  exerciseOption: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exerciseOptionActive: {
    backgroundColor: colors.surfaceMuted,
  },
  previewCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    gap: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceMuted,
  },
  chipText: {
    color: colors.text,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.primary,
  },
  });
