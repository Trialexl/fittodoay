import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { useToken } from '../hooks/useToken';
import { fetchWorkoutPlan, logWorkoutSet, PlanFolder, PlanTemplate, PlanExercise, WorkoutLog } from '../api/workout';
import { fetchDailyLoadsRange } from '../api/analytics';
import { fetchRecommendations, applyRecommendation, Recommendation } from '../api/recommendations';
import { useOfflineQueueSync, enqueueLog } from '../state/offlineQueue';
import { useOnline } from '../hooks/useOnline';
import { notifyError } from '../utils/notify';
import { colors } from '../theme/colors';
import { RestTimerOverlay } from '../components/RestTimerOverlay';
import { BrandMark } from '../components/BrandMark';
import Svg, { Path, Circle } from 'react-native-svg';

const CheckIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 20 20">
    <Circle cx={10} cy={10} r={9} fill="#0f1f15" stroke="#1f3b2b" strokeWidth={1.2} />
    <Path
      d="M6 10.5 9 13.5 14.5 8"
      stroke={colors.success}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const InfoIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 20 20">
    <Circle cx={10} cy={10} r={9} stroke={colors.border} strokeWidth={1.2} fill="none" />
    <Path
      d="M10 6.5v1M9.5 9h1v5h-1Z"
      stroke={colors.muted}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const EditIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 20 20">
    <Path
      d="M4 12.5 12.5 4a2 2 0 1 1 3 3L7 15.5 3 17l1-4.5Z"
      stroke={colors.muted}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const formatISODate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildCalendarGrid = (iso: string, loads: Record<string, number>) => {
  const cursor = new Date(iso);
  const startOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthName = startOfMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const weekOffset = (startOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(startOfMonth);
  gridStart.setDate(startOfMonth.getDate() - weekOffset);
  const todayIso = formatISODate(new Date());

  const days: { iso: string; inMonth: boolean; load: number; isSelected: boolean; isToday: boolean; day: number }[] =
    [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    const dayIso = formatISODate(current);
    days.push({
      iso: dayIso,
      inMonth: current.getMonth() === startOfMonth.getMonth(),
      load: loads[dayIso] ?? 0,
      isSelected: false,
      isToday: dayIso === todayIso,
      day: current.getDate(),
    });
  }
  return { days, monthName };
};

export function WorkoutScreen() {
  const token = useToken();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const online = useOnline();
  useOfflineQueueSync();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [cursorDate, setCursorDate] = useState<string | null>(null);
  const [restTimer, setRestTimer] = useState<{ visible: boolean; duration: number }>({
    visible: false,
    duration: 0,
  });
  const [isCalendarOpen, setCalendarOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Record<number, boolean>>({});
  const [expandedExercises, setExpandedExercises] = useState<Record<number, boolean>>({});
  const [folderTabs, setFolderTabs] = useState<Record<number, 'checklist' | 'recs'>>({});
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const monthBounds = useMemo(() => {
    const baseIso = cursorDate || selectedDate || todayIso;
    const base = new Date(baseIso);
    const start = new Date(base.getFullYear(), base.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { start, end };
  }, [cursorDate, selectedDate, todayIso]);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['workoutPlan', selectedDate],
    queryFn: () => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return fetchWorkoutPlan(token, selectedDate || undefined);
    },
    enabled: Boolean(token),
  });

  const recsQuery = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return fetchRecommendations(token);
    },
    enabled: Boolean(token),
  });

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof logWorkoutSet>[1]) => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return logWorkoutSet(token, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutPlan'] });
    },
    onError: async (err, variables) => {
      if (!online) {
        await enqueueLog(variables);
      }
    },
  });

  const applyRecMutation = useMutation({
    mutationFn: (rec: Recommendation) => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return applyRecommendation(token, rec);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutPlan'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    },
    onError: (err: any) => {
      notifyError(err?.message || 'Не удалось применить рекомендацию');
    },
  });

  const resolvedDate = useMemo(() => selectedDate || data?.date || todayIso, [selectedDate, data?.date, todayIso]);
  const dateText = useMemo(() => {
    if (!resolvedDate) return 'Сегодня';
    const planDate = new Date(resolvedDate);
    const planIso = planDate.toISOString().slice(0, 10);
    if (todayIso === planIso) return 'Сегодня';
    return format(planDate, 'yyyy-MM-dd');
  }, [resolvedDate, todayIso]);
  const hasData =
    (data?.folders || []).some(folder => (folder.templates || []).some(t => (t.exercises || []).length > 0));
  const handleSelectDate = (iso: string) => {
    setSelectedDate(iso);
    setCursorDate(iso);
    setCalendarOpen(false);
  };

  useEffect(() => {
    if (!cursorDate && resolvedDate) {
      setCursorDate(resolvedDate);
    }
  }, [cursorDate, resolvedDate]);

  const { data: loadsData } = useQuery({
    queryKey: ['dailyLoads', monthBounds.start, monthBounds.end],
    queryFn: () => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return fetchDailyLoadsRange(token, monthBounds.start, monthBounds.end);
    },
    enabled: Boolean(token),
  });

  const loadMap = useMemo(() => {
    const map: Record<string, number> = {};
    loadsData?.items.forEach(item => {
      map[item.date] = item.load;
    });
    return map;
  }, [loadsData]);

  const completedSets = data?.logs?.length ?? 0;
  const dailyLoad = loadMap[resolvedDate] ?? completedSets ?? 0;
  const logsBySet = useMemo(() => {
    const map = new Map<string, WorkoutLog>();
    data?.logs?.forEach(log => {
      map.set(`${log.template_exercise}-${log.set_index}`, log);
    });
    return map;
  }, [data?.logs]);

  const normalizeSets = (exercise: PlanExercise) => {
    const setsArray = Array.isArray(exercise.sets) ? exercise.sets : [];
    let setsCount = setsArray.length || (typeof exercise.sets === 'number' ? exercise.sets : 0);
    // если план пустой, но есть логи по этому упражнению — строим количество сетов из логов
    let maxLogIndex = -1;
    logsBySet.forEach((_, key) => {
      const [exIdStr, idxStr] = key.split('-');
      if (Number(exIdStr) === exercise.template_exercise) {
        maxLogIndex = Math.max(maxLogIndex, Number(idxStr));
      }
    });
    if (setsCount === 0 && maxLogIndex >= 0) {
      setsCount = maxLogIndex + 1;
    }
    const base = setsArray[0] || {};
    const repsDefault = exercise.reps ?? base.default_reps ?? 0;
    const weightDefault = exercise.weight ?? base.default_weight ?? 0;
    const timeDefault = exercise.time_seconds ?? base.default_time ?? 0;
    const restDefault = exercise.rest_seconds ?? base.rest ?? 0;
    const normalized =
      setsArray.length > 0
        ? setsArray
        : Array.from({ length: setsCount }, (_, idx) => ({
            set_index: idx,
            default_reps: repsDefault,
            default_weight: weightDefault,
            default_time: timeDefault,
            rest: restDefault,
          }));
    return {
      sets: normalized,
      defaults: { repsDefault, weightDefault, timeDefault, restDefault },
    };
  };

  const collectMuscles = useMemo(() => {
    const groups = new Map<string, number>();
    (data?.folders || []).forEach(folder =>
      (folder.templates || []).forEach(template =>
        (template.exercises || []).forEach(ex => {
          const muscles =
            (ex as any)?.source?.target_muscles
              ?.split(/[\\/,]/)
              .map((m: string) => m.trim())
              .filter(Boolean) || [];
          muscles.forEach(m => groups.set(m, (groups.get(m) || 0) + 1));
        }),
      ),
    );
    return Array.from(groups.entries()).sort((a, b) => b[1] - a[1]);
  }, [data?.folders]);

  const renderExercise = (exercise: PlanExercise) => {
    const { sets: normalizedSets, defaults } = normalizeSets(exercise);
    const { repsDefault, weightDefault, timeDefault, restDefault } = defaults;
    const doneCount = normalizedSets.reduce((acc, set, idx) => {
      const key = `${exercise.template_exercise}-${set.set_index ?? idx}`;
      return acc + (logsBySet.has(key) ? 1 : 0);
    }, 0);
    const exerciseComplete = normalizedSets.length > 0 && doneCount >= normalizedSets.length;
    const exerciseName = exercise.name || (exercise as any)?.source?.name || 'Упражнение';

    const expanded = expandedExercises[exercise.template_exercise] ?? true;
    return (
      <View
        style={[
          styles.exercise,
          expanded && styles.exerciseExpanded,
          exerciseComplete && styles.exerciseDone,
        ]}>
        <Pressable
          style={styles.exerciseHeader}
          onPress={() =>
            setExpandedExercises(prev => ({
              ...prev,
              [exercise.template_exercise]: !expanded,
            }))
          }>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {doneCount === normalizedSets.length ? <CheckIcon /> : null}
              <Text style={styles.exerciseTitle}>{exerciseName}</Text>
              <InfoIcon />
              <EditIcon />
            </View>
            <Text style={styles.exerciseProgress}>
              Выполнено: {doneCount}/{normalizedSets.length}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={styles.progressPill}>
              {doneCount}/{normalizedSets.length}
            </Text>
            {restDefault ? <Text style={styles.muted}>Отдых: {restDefault}s</Text> : null}
          </View>
          <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
        </Pressable>
        {expanded ? (
          <View style={{ gap: 10 }}>
            {normalizedSets.map((set, idx) => {
              const key = `${exercise.template_exercise}-${set.set_index ?? idx}`;
              const isDone = logsBySet.has(key);
              const setIndex = set.set_index ?? idx;
              const plannedReps = set.default_reps ?? repsDefault;
              const plannedWeight = set.default_weight ?? weightDefault;
              const plannedTime = set.default_time ?? timeDefault;
              const plannedRest = set.rest ?? restDefault;
              const planTextParts = [];
              if (plannedReps) planTextParts.push(`План: ${plannedReps} повт.`);
              if (plannedWeight) planTextParts.push(`${plannedWeight} кг`);
              if (plannedTime) planTextParts.push(`${plannedTime}s`);
              const log = logsBySet.get(key);
              const factParts: string[] = [];
              if (log?.reps != null) factParts.push(`Факт: ${log.reps} повт.`);
              if (log?.weight != null) factParts.push(`${log.weight} кг`);
              if (log?.time_seconds != null) factParts.push(`${log.time_seconds}s`);
              return (
                <View key={key} style={[styles.setCard, isDone && styles.setCardDone]}>
                  <View style={styles.setRow}>
                    <Text style={[styles.setTitle, isDone && styles.setTitleDone]}>Сет {setIndex + 1}</Text>
                    {plannedRest ? <Text style={styles.muted}>Отдых: {plannedRest}s</Text> : null}
                  </View>
                  {planTextParts.length > 0 ? (
                    <Text style={[styles.muted, isDone && styles.mutedDone]}>{planTextParts.join(' • ')}</Text>
                  ) : null}
                  {factParts.length > 0 ? <Text style={styles.factText}>{factParts.join(' • ')}</Text> : null}
                  <Pressable
                    disabled={isDone}
                    style={[
                      styles.doneButton,
                      isDone ? styles.doneButtonCompleted : styles.doneButtonPending,
                    ]}
                    onPress={() => {
                      const payload = {
                        workout_day: data?.workout_day_id || 0,
                        template_exercise: exercise.template_exercise,
                        set_index: setIndex,
                        reps: plannedReps ?? undefined,
                        weight: plannedWeight ?? undefined,
                        time_seconds: plannedTime ?? undefined,
                      };
                      mutation.mutate(payload, {
                        onSuccess: () => {
                          if (plannedRest) {
                            setRestTimer({ visible: true, duration: plannedRest });
                          }
                        },
                        onError: async () => {
                          if (!online) {
                            await enqueueLog(payload);
                            if (plannedRest) {
                              setRestTimer({ visible: true, duration: plannedRest });
                            }
                          }
                        },
                      });
                    }}>
                    <Text style={isDone ? styles.doneButtonTextCompleted : styles.doneButtonText}>
                      ✓ Выполнено
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  const renderTemplate = (template: PlanTemplate) => {
    const stats = template.exercises.reduce(
      (acc, ex) => {
        const { sets } = normalizeSets(ex);
        acc.total += sets.length;
        acc.done += sets.reduce((done, set, idx) => {
          const key = `${ex.template_exercise}-${set.set_index ?? idx}`;
          return done + (logsBySet.has(key) ? 1 : 0);
        }, 0);
        return acc;
      },
      { done: 0, total: 0 },
    );
    const templateDone = stats.total > 0 && stats.done >= stats.total;
    const expanded = expandedTemplates[template.id] ?? true;
    return (
      <View
        key={template.id}
        style={[
          styles.templateCard,
          templateDone && styles.cardDone,
          expanded && styles.templateExpanded,
        ]}>
        <Pressable
          style={styles.templateHeader}
          onPress={() =>
            setExpandedTemplates(prev => ({
              ...prev,
              [template.id]: !expanded,
            }))
          }>
          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {templateDone ? <CheckIcon /> : null}
              <Text style={styles.templateTitle}>{template.name}</Text>
            </View>
            <Text style={styles.exerciseProgress}>Выполнено: {stats.done}/{stats.total}</Text>
          </View>
          {!template.is_active ? <Text style={styles.badge}>Не активен</Text> : null}
          <Text style={styles.progressPill}>{stats.done}/{stats.total}</Text>
          <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
        </Pressable>
        {expanded ? (
          <View style={{ gap: 12 }}>
            {template.exercises.map((ex, index) => (
              <View key={`${template.id}-${ex.template_exercise ?? ex.id ?? index}`}>{renderExercise(ex)}</View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  const statsByFolder = useMemo(() => {
    const result: Record<number, { done: number; total: number }> = {};
    (data?.folders || []).forEach(folder => {
      let done = 0;
      let total = 0;
      folder.templates.forEach(t => {
        t.exercises.forEach(ex => {
          const { sets } = normalizeSets(ex);
          total += sets.length;
          done += sets.reduce((acc, set, idx) => {
            const key = `${ex.template_exercise}-${set.set_index ?? idx}`;
            return acc + (logsBySet.has(key) ? 1 : 0);
          }, 0);
        });
      });
      result[folder.id] = { done, total };
    });
    return result;
  }, [data?.folders, logsBySet]);

  const renderFolder = ({ item }: { item: PlanFolder }) => {
    const stats = statsByFolder[item.id] || { done: 0, total: 0 };
    const expanded = expandedFolders[item.id] ?? true;
    return (
      <View
        style={[
          styles.folderCard,
          !item.is_active && styles.folderCardInactive,
          stats.total > 0 && stats.done >= stats.total ? styles.cardDone : null,
          expanded && styles.folderExpanded,
        ]}>
        <Pressable
          style={styles.folderHeader}
          onPress={() =>
            setExpandedFolders(prev => ({
              ...prev,
              [item.id]: !expanded,
            }))
          }>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {stats.total > 0 && stats.done >= stats.total ? <CheckIcon /> : null}
            <Text style={styles.folderTitle}>{item.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.progressPill}>{stats.done}/{stats.total}</Text>
            {!item.is_active ? <Text style={styles.badge}>Не активна</Text> : null}
            <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
          </View>
        </Pressable>
        {expanded ? (
          <View style={{ gap: 14 }}>
            <View style={styles.folderActions}>
              {['checklist', 'recs'].map(tab => {
                const isActive = (folderTabs[item.id] ?? 'checklist') === tab;
                return (
                  <Pressable
                    key={tab}
                    style={[styles.folderTab, isActive && styles.folderTabActive]}
                    onPress={() =>
                      setFolderTabs(prev => ({
                        ...prev,
                        [item.id]: tab as 'checklist' | 'recs',
                      }))
                    }>
                    <Text style={[styles.folderTabText, isActive && styles.folderTabTextActive]}>
                      {tab === 'checklist' ? 'Чеклист' : 'Рекомендации'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {(folderTabs[item.id] ?? 'checklist') === 'checklist' ? (
              item.templates.map((t, idx) => (
                <View key={`${item.id}-${t.id}-${idx}`}>{renderTemplate(t)}</View>
              ))
            ) : (
              <View style={styles.recWrapper}>
                {recsQuery.isLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : recsQuery.data && recsQuery.data.length > 0 ? (
                  recsQuery.data.map(rec => (
                    <View key={rec.id} style={styles.recCard}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.exerciseTitle}>{rec.exercise_name || 'Упражнение'}</Text>
                        <InfoIcon />
                      </View>
                      {rec.note ? <Text style={styles.muted}>{rec.note}</Text> : null}
                      <Pressable
                        style={styles.recApply}
                        onPress={() => applyRecMutation.mutate(rec)}
                        disabled={applyRecMutation.isLoading}>
                        <Text style={styles.recApplyText}>Применить</Text>
                      </Pressable>
                    </View>
                  ))
                ) : (
                  <Text style={styles.muted}>Рекомендаций нет</Text>
                )}
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Screen>
      <ScrollView>
      <View style={styles.topbar}>
        <BrandMark size="sm" />
      </View>

        <View style={styles.headerRow}>
          <View style={styles.header}>
            <Text style={styles.label}>Дневной чеклист</Text>
            <Text style={styles.title}>{dateText || 'Сегодня'}</Text>
            <View style={styles.actionsRow}>
              <Pressable style={styles.iconButton} onPress={() => setCalendarOpen(true)}>
                <Text style={styles.iconButtonText}>📅</Text>
              </Pressable>
            </View>
            {!online ? (
              <Text style={styles.offlineNote}>
                Офлайн: отметки сохранятся в очереди и отправятся позже.
              </Text>
            ) : null}
          </View>
          <Pressable style={styles.summaryCard} onPress={() => setCalendarOpen(true)}>
            <Text style={styles.summaryDate}>{resolvedDate || '—'}</Text>
            <Text style={styles.summaryValue}>{Math.round(dailyLoad)}</Text>
            <Text style={styles.summaryLabel}>нагрузка за день</Text>
          </Pressable>
        </View>

        {collectMuscles.length > 0 ? (
          <View style={styles.tagCard}>
            <Text style={styles.tagLabel}>День ({resolvedDate})</Text>
            <View style={styles.tagsRow}>
              {collectMuscles.slice(0, 8).map(([muscle, count]) => (
                <View key={muscle} style={styles.tagPill}>
                  <Text style={styles.tagText}>
                    {muscle}
                    {count > 1 ? ` ×${count}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#f2b200" />
          </View>
        ) : error ? (
          <Text style={styles.errorText}>Не удалось загрузить план</Text>
        ) : !hasData ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>На сегодня тренировок нет</Text>
            <Text style={styles.emptySubtitle}>
              Активируйте папку «Основная» или создайте новую программу, чтобы заполнить чеклист.
            </Text>
            <Pressable
              style={styles.cta}
              onPress={() => navigation.navigate('Assistant' as never)}>
              <Text style={styles.ctaText}>Создать программу</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {(data?.folders || []).map(folder => (
              <View key={folder.id}>{renderFolder({ item: folder })}</View>
            ))}
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
      <RestTimerOverlay
        visible={restTimer.visible}
        duration={restTimer.duration || 60}
        onSkip={() => setRestTimer({ visible: false, duration: 0 })}
        onFinish={() => setRestTimer({ visible: false, duration: 0 })}
      />
      {isCalendarOpen ? (
        <Modal transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
          <View style={styles.dateModalBackdrop}>
            <View style={styles.dateModalCard}>
              <View style={styles.calendarHeader}>
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => {
                    const base = cursorDate || resolvedDate || todayIso;
                    const current = new Date(base);
                    const prev = new Date(current.getFullYear(), current.getMonth() - 1, 1)
                      .toISOString()
                      .slice(0, 10);
                    setCursorDate(prev);
                  }}>
                  <Text style={styles.navText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.monthTitle}>
                  {new Date(cursorDate || resolvedDate || todayIso).toLocaleDateString('ru-RU', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </Text>
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => {
                    const base = cursorDate || resolvedDate || todayIso;
                    const current = new Date(base);
                    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1)
                      .toISOString()
                      .slice(0, 10);
                    setCursorDate(next);
                  }}>
                  <Text style={styles.navText}>→</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.weekRow}>
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                  <Text key={d} style={styles.weekday}>
                    {d}
                  </Text>
                ))}
              </View>
              <View style={styles.grid}>
                {(() => {
                  const baseIso = cursorDate || resolvedDate || todayIso;
                  const { days } = buildCalendarGrid(baseIso, loadMap);
                  return days.map(day => (
                    <Pressable
                      key={day.iso}
                      style={[
                        styles.dayCell,
                        (day.isSelected || day.iso === resolvedDate) && styles.daySelected,
                        !day.inMonth && styles.dayMuted,
                        day.isToday && day.iso !== resolvedDate ? styles.dayToday : null,
                      ]}
                      onPress={() => handleSelectDate(day.iso)}>
                      <Text
                        style={[
                          styles.dayNumber,
                          (day.isSelected || day.iso === resolvedDate) ? styles.dayNumberSelected : null,
                          !day.inMonth ? styles.dayNumberMuted : null,
                        ]}>
                        {day.day}
                      </Text>
                      <Text
                        style={[
                          styles.dayLoad,
                          (day.isSelected || day.iso === resolvedDate) ? styles.dayLoadSelected : null,
                        ]}>
                        {day.load ? Math.round(day.load) : '—'}
                      </Text>
                    </Pressable>
                  ));
                })()}
              </View>
              <TouchableOpacity
                style={styles.dateClose}
                onPress={() => setCalendarOpen(false)}>
                <Text style={styles.dateCloseText}>Закрыть</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingTop: 4,
  },
  header: {
    gap: 6,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  label: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionsButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
  },
  actionsButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  iconButtonText: {
    color: colors.muted,
    fontSize: 18,
  },
  progressPill: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subtitle: {
    color: colors.muted,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  folderCardInactive: {
    opacity: 0.7,
  },
  folderExpanded: {
    borderColor: colors.primary,
  },
  cardDone: {
    backgroundColor: '#0f1f15',
    borderColor: '#1f3b2b',
  },
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  folderTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 18,
  },
  badge: {
    color: colors.primary,
    fontSize: 12,
  },
  iconSuccess: {
    color: colors.success,
    fontSize: 14,
  },
  offlineNote: {
    color: colors.primary,
    fontSize: 13,
  },
  templateCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 10,
  },
  templateExpanded: {
    borderColor: colors.primary,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  templateTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  exercise: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseExpanded: {
    borderColor: colors.primary,
  },
  exerciseDone: {
    backgroundColor: '#0f1f15',
    borderColor: '#1f3b2b',
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  exerciseProgress: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
  },
  errorText: {
    color: colors.danger,
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 12,
  },
  recCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 160,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  summaryDate: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  tagCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 14,
    marginBottom: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  tagLabel: {
    color: colors.muted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '12',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  tagText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 20,
    gap: 10,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: colors.muted,
  },
  cta: {
    marginTop: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: {
    color: colors.primaryText,
    fontFamily: 'Inter-Bold',
  },
  setCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  setCardDone: {
    backgroundColor: '#0f1f15',
    borderColor: '#1f3b2b',
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  setTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  setTitleDone: {
    color: colors.success,
  },
  doneButton: {
    marginTop: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  doneButtonPending: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  doneButtonCompleted: {
    backgroundColor: '#0f1f15',
    borderColor: '#1f3b2b',
  },
  doneButtonText: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  doneButtonTextCompleted: {
    color: colors.muted,
    fontWeight: '700',
  },
  mutedDone: {
    color: colors.success,
  },
  chevron: {
    color: colors.muted,
    fontSize: 14,
    marginLeft: 8,
  },
  iconMuted: {
    color: colors.muted,
    fontSize: 12,
  },
  folderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  folderTab: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  folderTabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  folderTabText: {
    color: colors.primary,
    fontWeight: '700',
  },
  folderTabTextActive: {
    color: colors.primary,
  },
  recWrapper: {
    gap: 10,
  },
  recApply: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  recApplyText: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  factText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  dateModalBackdrop: {
    flex: 1,
    backgroundColor: '#000000aa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateModalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    width: 320,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateClose: {
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  dateCloseText: {
    color: colors.primaryText,
    fontFamily: 'Inter-Bold',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  navText: {
    color: colors.text,
    fontFamily: 'Inter-Bold',
  },
  monthTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'capitalize',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayCell: {
    width: '14.2%',
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    backgroundColor: colors.surface,
  },
  dayMuted: {
    opacity: 0.5,
  },
  daySelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '22',
  },
  dayToday: {
    borderColor: colors.primary,
  },
  dayNumber: {
    color: colors.text,
    fontFamily: 'Inter-Bold',
  },
  dayNumberSelected: {
    color: colors.primary,
  },
  dayNumberMuted: {
    color: colors.muted,
  },
  dayLoad: {
    color: colors.muted,
    fontSize: 12,
  },
  dayLoadSelected: {
    color: colors.primary,
  },
});
