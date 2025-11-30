import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { useToken } from '../hooks/useToken';
import {
  fetchWorkoutPlan,
  logWorkoutSet,
  PlanFolder,
  PlanTemplate,
  PlanExercise,
  WorkoutLog,
  updateWorkoutLog,
  deleteWorkoutLog,
} from '../api/workout';
import { fetchDailyLoadsRange } from '../api/analytics';
import { fetchRecommendations, applyRecommendation, Recommendation } from '../api/recommendations';
import { useOfflineQueueSync, enqueueLog, getOfflineQueueCount } from '../state/offlineQueue';
import { useOnline } from '../hooks/useOnline';
import { notifyError } from '../utils/notify';
import { useThemedColors } from '../theme/colors';
import { RestTimerOverlay } from '../components/RestTimerOverlay';
import { ExecutionOverlay } from '../components/ExecutionOverlay';
import { AdjustNumber } from '../components/AdjustNumber';
import { BrandMark } from '../components/BrandMark';
import Svg, { Path, Circle } from 'react-native-svg';
import { config } from '../config/env';

const getTemplateExerciseId = (
  exercise: PlanExercise | { template_exercise?: number; template_exercise_id?: number; id?: number },
) =>
  exercise.template_exercise ??
  (exercise as any).template_exercise_id ??
  (exercise as any).id ??
  0;

const CheckIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 20 20">
    <Circle cx={10} cy={10} r={9} fill="#0f1f15" stroke="#1f3b2b" strokeWidth={1.2} />
    <Path
      d="M6 10.5 9 13.5 14.5 8"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const InfoIcon = ({ border, stroke }: { border: string; stroke: string }) => (
  <Svg width={18} height={18} viewBox="0 0 20 20">
    <Circle cx={10} cy={10} r={9} stroke={border} strokeWidth={1.2} fill="none" />
    <Path
      d="M10 6.5v1M9.5 9h1v5h-1Z"
      stroke={stroke}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const EditIcon = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 20 20">
    <Path
      d="M4 12.5 12.5 4a2 2 0 1 1 3 3L7 15.5 3 17l1-4.5Z"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

const STATIC_BASE_URL = config.apiUrl?.replace(/\/$/, '') || '';
const EXPANSION_STORAGE_KEY = 'fitTODOay/workoutExpanded';
const buildExerciseImageUrl = (path?: string) => {
  if (!path) return '';
  const encoded = path
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');
  return `${STATIC_BASE_URL}/static/${encoded}`;
};

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
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const token = useToken();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const online = useOnline();
  const [selectedDate, setSelectedDate] = useState<string | null>(route?.params?.date || null);
  const [cursorDate, setCursorDate] = useState<string | null>(null);
  const [restOverlay, setRestOverlay] = useState<{
    visible: boolean;
    rest: number;
    hasTime: boolean;
    hasWeight: boolean;
    initialReps: number | null;
    initialWeight: number | null;
    initialTime: number | null;
    payloadBase: { workout_day: number; template_exercise: number; set_index: number };
  }>({ visible: false, rest: 0, hasTime: false, hasWeight: true, initialReps: null, initialWeight: null, initialTime: null, payloadBase: { workout_day: 0, template_exercise: 0, set_index: 0 } });
  const [restValues, setRestValues] = useState({ reps: '', weight: '', time: '' });
  const [execOverlay, setExecOverlay] = useState<{
    visible: boolean;
    exerciseName: string;
    duration: number;
    rest: number;
    payloadBase: { workout_day: number; template_exercise: number; set_index: number };
  }>({ visible: false, exerciseName: '', duration: 0, rest: 0, payloadBase: { workout_day: 0, template_exercise: 0, set_index: 0 } });
  const [isCalendarOpen, setCalendarOpen] = useState(false);
  const [expansionHydrated, setExpansionHydrated] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Record<number, boolean>>({});
  const [expandedExercises, setExpandedExercises] = useState<Record<number, boolean>>({});
  const [folderTabs, setFolderTabs] = useState<Record<number, 'checklist' | 'recs'>>({});
  const [queueCount, setQueueCount] = useState(0);
  const [queueSyncing, setQueueSyncing] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{
    visible: boolean;
    log?: WorkoutLog;
    exerciseName?: string;
    hasTime?: boolean;
    hasWeight?: boolean;
    values?: { reps: string; weight: string; time: string };
  }>({ visible: false });
  const [infoModal, setInfoModal] = useState<{
    visible: boolean;
    name?: string;
    description?: string;
    muscles?: string;
    difficulty?: string;
    images?: { order: number; path: string }[];
  }>({ visible: false });
  const [recInputs, setRecInputs] = useState<Record<number, { reps: string; weight: string }>>({});
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const queueSyncHandlers = useMemo(
    () => ({
      onSyncStart: () => {
        setQueueSyncing(true);
        setQueueError(null);
      },
      onSync: (info: { sent: number; remaining: number }) => {
        setQueueSyncing(false);
        setQueueCount(info.remaining);
      },
      onError: (err: Error) => {
        setQueueSyncing(false);
        setQueueError(err?.message || 'Не удалось синхронизировать очередь');
      },
    }),
    [],
  );

  useOfflineQueueSync(queueSyncHandlers);

  const monthBounds = useMemo(() => {
    const baseIso = cursorDate || selectedDate || todayIso;
    const base = new Date(baseIso);
    const start = formatISODate(new Date(base.getFullYear(), base.getMonth(), 1));
    const end = formatISODate(new Date(base.getFullYear(), base.getMonth() + 1, 0));
    return { start, end };
  }, [cursorDate, selectedDate, todayIso]);

  const { data, isLoading, error } = useQuery({
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

  useEffect(() => {
    getOfflineQueueCount().then(count => setQueueCount(count)).catch(() => null);
  }, [data?.logs]);

  useEffect(() => {
    if (!online) return;
    getOfflineQueueCount().then(count => setQueueCount(count)).catch(() => null);
  }, [online]);

  useEffect(() => {
    AsyncStorage.getItem(EXPANSION_STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) || {};
          if (parsed.folders) setExpandedFolders(parsed.folders);
          if (parsed.templates) setExpandedTemplates(parsed.templates);
          if (parsed.exercises) setExpandedExercises(parsed.exercises);
        } catch {
          // ignore broken cache
        }
      })
      .catch(() => null)
      .finally(() => setExpansionHydrated(true));
  }, []);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof logWorkoutSet>[1]) => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return logWorkoutSet(token, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workoutPlan'] });
      getOfflineQueueCount().then(count => setQueueCount(count)).catch(() => null);
    },
    onError: async (_err, variables) => {
      if (!online) {
        await enqueueLog(variables);
        setQueueCount(prev => prev + 1);
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

  const resolvedDate = useMemo(() => data?.date || selectedDate || todayIso, [data?.date, selectedDate, todayIso]);
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

  const parseNumber = (value?: string) => {
    if (!value) return null;
    const num = Number(value.replace(',', '.'));
    return Number.isNaN(num) ? null : num;
  };

  const closeRestOverlay = () => {
    setRestOverlay(prev => ({ ...prev, visible: false }));
    setRestValues({ reps: '', weight: '', time: '' });
  };

  const closeEditModal = () => setEditModal({ visible: false });

  const handleEditSave = async () => {
    if (!editModal.log || !token) return;
    const payload: { actual_reps?: number | null; actual_weight?: number | null; actual_time?: number | null } = {};
    if (editModal.hasTime) {
      payload.actual_time = parseNumber(editModal.values?.time);
      payload.actual_reps = null;
      payload.actual_weight = null;
    } else {
      payload.actual_reps = parseNumber(editModal.values?.reps);
      if (editModal.hasWeight) {
        payload.actual_weight = parseNumber(editModal.values?.weight);
      }
      payload.actual_time = null;
    }
    try {
      await updateWorkoutLog(token, editModal.log.id!, payload);
      closeEditModal();
      queryClient.invalidateQueries({ queryKey: ['workoutPlan'] });
    } catch (e: any) {
      notifyError(e?.message || 'Не удалось сохранить');
    }
  };

  const handleEditDelete = async () => {
    if (!editModal.log?.id || !token) return;
    try {
      await deleteWorkoutLog(token, editModal.log.id);
      closeEditModal();
      queryClient.invalidateQueries({ queryKey: ['workoutPlan'] });
    } catch (e: any) {
      notifyError(e?.message || 'Не удалось удалить');
    }
  };

  const handleRestFinish = () => {
    const base = restOverlay.payloadBase;
    const payload: Parameters<typeof logWorkoutSet>[1] = {
      workout_day: base.workout_day,
      template_exercise: base.template_exercise,
      set_index: base.set_index,
    };
    if (restOverlay.hasTime) {
      payload.actual_time = parseNumber(restValues.time) ?? restOverlay.initialTime ?? undefined;
      payload.actual_reps = null;
      payload.actual_weight = null;
    } else {
      payload.actual_reps = parseNumber(restValues.reps) ?? restOverlay.initialReps ?? undefined;
      if (restOverlay.hasWeight) {
          payload.actual_weight = parseNumber(restValues.weight) ?? restOverlay.initialWeight ?? undefined;
      }
      payload.actual_time = null;
    }
    submitLog(payload, restOverlay.rest);
    closeRestOverlay();
  };

  const handleRestSkip = () => {
    closeRestOverlay();
  };

  useEffect(() => {
    if (!cursorDate && resolvedDate) {
      setCursorDate(resolvedDate);
    }
  }, [cursorDate, resolvedDate]);
  useEffect(() => {
    if (route?.params?.date) {
      setSelectedDate(route.params.date);
      setCursorDate(route.params.date);
    }
  }, [route?.params?.date]);

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
    const counters: Record<number, number> = {};
    data?.logs?.forEach((log) => {
      const numericIndex = Number(log.set_index);
      const hasIndex = Number.isFinite(numericIndex);
      const fallbackIndex = counters[log.template_exercise] ?? 0;
      const normalizedIndex = hasIndex ? numericIndex : fallbackIndex;
      counters[log.template_exercise] = normalizedIndex + 1;

      const key = `${log.template_exercise}-${normalizedIndex}`;
      map.set(key, { ...log, set_index: normalizedIndex });

      // Если сервер присылает set_index с 1, а план использует 0 — добавим сдвиг для совпадения.
      if (normalizedIndex > 0) {
        const zeroBasedKey = `${log.template_exercise}-${normalizedIndex - 1}`;
        if (!map.has(zeroBasedKey)) {
          map.set(zeroBasedKey, { ...log, set_index: normalizedIndex - 1 });
        }
      }
    });
    return map;
  }, [data?.logs]);

  const normalizeSets = React.useCallback((exercise: PlanExercise) => {
    const setsArray = Array.isArray(exercise.sets) ? exercise.sets : [];
    const templateExerciseId = getTemplateExerciseId(exercise);
    let setsCount = setsArray.length || (typeof exercise.sets === 'number' ? exercise.sets : 0);
    // если план пустой, но есть логи по этому упражнению — строим количество сетов из логов
    let maxLogIndex = -1;
    logsBySet.forEach((_, key) => {
      const [exIdStr, idxStr] = key.split('-');
      if (Number(exIdStr) === templateExerciseId) {
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
      templateExerciseId,
    };
  }, [logsBySet]);

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

  const openRest = (exercise: PlanExercise, setIndex: number, planned: { reps?: number | null; weight?: number | null; time?: number | null; rest?: number | null }) => {
    const templateExerciseId = getTemplateExerciseId(exercise);
    setRestValues({
      reps: planned.reps != null ? String(planned.reps) : '',
      weight: planned.weight != null ? String(planned.weight) : '',
      time: planned.time != null ? String(planned.time) : '',
    });
    setRestOverlay({
      visible: true,
      rest: planned.rest || 0,
      hasTime: exercise.has_time,
      hasWeight: exercise.has_weight,
      initialReps: planned.reps ?? null,
      initialWeight: planned.weight ?? null,
      initialTime: planned.time ?? null,
      payloadBase: {
        workout_day: data?.workout_day_id || 0,
        template_exercise: templateExerciseId,
        set_index: setIndex,
      },
    });
  };

  const handleExecutionFinish = (actualTime: number) => {
    setExecOverlay(prev => ({ ...prev, visible: false }));
    openRest(
      { has_time: true, has_weight: false, template_exercise: execOverlay.payloadBase.template_exercise } as any,
      execOverlay.payloadBase.set_index,
      {
        time: actualTime,
        rest: execOverlay.rest,
      },
    );
  };

  const submitLog = async (payload: Parameters<typeof logWorkoutSet>[1], restSeconds?: number) => {
    mutation.mutate(payload, {
      onSuccess: () => {
        setRestOverlay(prev => ({ ...prev, visible: false }));
        setExecOverlay(prev => ({ ...prev, visible: false }));
        if (restSeconds) {
          setRestOverlay(prev => ({ ...prev, visible: true, rest: restSeconds }));
        }
      },
      onError: async () => {
        if (!online) {
          await enqueueLog(payload);
          setQueueCount(prev => prev + 1);
          if (restSeconds) {
            setRestOverlay(prev => ({ ...prev, visible: true, rest: restSeconds }));
          }
        } else {
          notifyError('Не удалось сохранить подход');
        }
      },
    });
  };

  const renderExercise = (exercise: PlanExercise) => {
    const { sets: normalizedSets, defaults, templateExerciseId } = normalizeSets(exercise);
    const { repsDefault, weightDefault, timeDefault, restDefault } = defaults;
    const doneCount = normalizedSets.reduce((acc, set, idx) => {
      const key = `${templateExerciseId}-${set.set_index ?? idx}`;
      const altKey = `${templateExerciseId}-${(set.set_index ?? idx) + 1}`;
      return acc + (logsBySet.has(key) || logsBySet.has(altKey) ? 1 : 0);
    }, 0);
    const exerciseComplete = normalizedSets.length > 0 && doneCount >= normalizedSets.length;
    const exerciseName = exercise.name || (exercise as any)?.source?.name || 'Упражнение';

    const expanded = expandedExercises[templateExerciseId] ?? true;
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
              [templateExerciseId]: !expanded,
            }))
          }>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {doneCount === normalizedSets.length ? <CheckIcon color={colors.success} /> : null}
              <Text style={styles.exerciseTitle}>{exerciseName}</Text>
              <Pressable
                onPress={() => {
                  const source: any = (exercise as any).source || {};
                  setInfoModal({
                    visible: true,
                    name: exerciseName,
                    description:
                      typeof source.description === 'string'
                        ? source.description
                        : source.description?.text,
                    muscles: source.target_muscles,
                    difficulty: source.difficulty,
                    images: source.images || [],
                  });
                }}>
                <InfoIcon border={colors.border} stroke={colors.muted} />
              </Pressable>
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
              const key = `${templateExerciseId}-${set.set_index ?? idx}`;
              const altKey = `${templateExerciseId}-${(set.set_index ?? idx) + 1}`;
              const isDone = logsBySet.has(key) || logsBySet.has(altKey);
              const setIndex = set.set_index ?? idx;
              const plannedReps = set.default_reps ?? repsDefault;
              const plannedWeight = set.default_weight ?? weightDefault;
              const plannedTime = set.default_time ?? timeDefault;
              const plannedRest = set.rest ?? restDefault;
              const log = logsBySet.get(key) || logsBySet.get(altKey);
              const factParts: string[] = [];
              const repVal = (log as any)?.actual_reps ?? log?.reps;
              const weightVal = (log as any)?.actual_weight ?? log?.weight;
              const timeVal = (log as any)?.actual_time ?? log?.time_seconds;
              if (repVal != null) factParts.push(`Факт: ${repVal} повт.`);
              if (weightVal != null) factParts.push(`${weightVal} кг`);
              if (timeVal != null) factParts.push(`${timeVal}s`);
              return (
                <View key={key} style={[styles.setCard, isDone && styles.setCardDone]}>
                  <View style={styles.setRow}>
                    <Text style={[styles.setTitle, isDone && styles.setTitleDone]}>Сет {setIndex + 1}</Text>
                    {plannedRest ? <Text style={styles.muted}>Отдых: {plannedRest}s</Text> : null}
                  </View>
                  <View style={styles.planRow}>
                    {!exercise.has_time ? (
                      <>
                        <AdjustNumber
                          label="План повт."
                          value={String(plannedReps || '')}
                          onChange={() => {}}
                          disabled
                        />
                        {exercise.has_weight ? (
                          <AdjustNumber
                            label="План вес"
                            value={String(plannedWeight || '')}
                            onChange={() => {}}
                            disabled
                          />
                        ) : null}
                      </>
                    ) : (
                      <AdjustNumber label="План время" value={String(plannedTime || '')} onChange={() => {}} disabled />
                    )}
                  </View>
                  {factParts.length > 0 ? <Text style={styles.factText}>{factParts.join(' • ')}</Text> : null}
                  {isDone ? (
                    <Pressable
                      onPress={() =>
                        setEditModal({
                          visible: true,
                          log,
                          exerciseName,
                          hasTime: exercise.has_time,
                          hasWeight: exercise.has_weight,
                          values: {
                            reps: log?.reps != null ? String(log.reps) : '',
                            weight: log?.weight != null ? String(log.weight) : '',
                            time: log?.time_seconds != null ? String(log.time_seconds) : '',
                          },
                        })
                      }
                      style={styles.editLink}>
                      <Text style={styles.editLinkText}>Редактировать</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.factInputs}>
                      {!exercise.has_time ? (
                        <>
                          <AdjustNumber
                            label="Факт повт."
                            value={restValues.reps}
                            onChange={text => setRestValues(prev => ({ ...prev, reps: text }))}
                          />
                          {exercise.has_weight ? (
                            <AdjustNumber
                              label="Факт вес"
                              value={restValues.weight}
                              onChange={text => setRestValues(prev => ({ ...prev, weight: text }))}
                              inputMode="decimal"
                              step={2}
                            />
                          ) : null}
                        </>
                      ) : (
                        <AdjustNumber
                          label="Факт время"
                          value={restValues.time}
                          onChange={text => setRestValues(prev => ({ ...prev, time: text }))}
                        />
                      )}
                    </View>
                  )}
                  <Pressable
                    disabled={isDone}
                    style={[
                      styles.doneButton,
                      isDone ? styles.doneButtonCompleted : styles.doneButtonPending,
                    ]}
                    onPress={() => {
                      const templateExerciseId = getTemplateExerciseId(exercise);
                      const basePayload = {
                        workout_day: data?.workout_day_id || 0,
                        template_exercise: templateExerciseId,
                        set_index: setIndex,
                      };
                      if (exercise.has_time) {
                        const duration = plannedTime || 0;
                        setExecOverlay({
                          visible: true,
                          exerciseName,
                          duration: duration || 0,
                          rest: plannedRest || 0,
                          payloadBase: basePayload,
                        });
                      } else {
                        openRest(exercise, setIndex, {
                          reps: plannedReps,
                          weight: plannedWeight,
                          rest: plannedRest,
                        });
                        setRestOverlay(prev => ({
                          ...prev,
                          payloadBase: basePayload,
                        }));
                      }
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
          const templateExerciseId = getTemplateExerciseId(ex);
          const key = `${templateExerciseId}-${set.set_index ?? idx}`;
          const altKey = `${templateExerciseId}-${(set.set_index ?? idx) + 1}`;
          return done + (logsBySet.has(key) || logsBySet.has(altKey) ? 1 : 0);
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
              {templateDone ? <CheckIcon color={colors.success} /> : null}
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
              <View key={`${template.id}-${getTemplateExerciseId(ex) || index}`}>{renderExercise(ex)}</View>
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
          const templateExerciseId = getTemplateExerciseId(ex);
          total += sets.length;
          done += sets.reduce((acc, set, idx) => {
            const key = `${templateExerciseId}-${set.set_index ?? idx}`;
            const altKey = `${templateExerciseId}-${(set.set_index ?? idx) + 1}`;
            return acc + (logsBySet.has(key) || logsBySet.has(altKey) ? 1 : 0);
          }, 0);
        });
      });
      result[folder.id] = { done, total };
    });
    return result;
  }, [data?.folders, logsBySet, normalizeSets]);

  useEffect(() => {
    if (!data?.folders || !expansionHydrated) return;
    let changed = false;
    const nextFolders = { ...expandedFolders };
    const nextTemplates = { ...expandedTemplates };
    const nextExercises = { ...expandedExercises };

    data.folders.forEach(folder => {
      const folderStats = statsByFolder[folder.id] || { done: 0, total: 0 };
      if (nextFolders[folder.id] === undefined) {
        nextFolders[folder.id] = !(folderStats.total > 0 && folderStats.done >= folderStats.total);
        changed = true;
      }
      folder.templates.forEach(template => {
        let templateTotal = 0;
        let templateDoneCount = 0;
        template.exercises.forEach(ex => {
          const { sets } = normalizeSets(ex);
          const templateExerciseId = getTemplateExerciseId(ex);
          const completedSets = sets.reduce((acc, set, idx) => {
            const key = `${templateExerciseId}-${set.set_index ?? idx}`;
            const altKey = `${templateExerciseId}-${(set.set_index ?? idx) + 1}`;
            return acc + (logsBySet.has(key) || logsBySet.has(altKey) ? 1 : 0);
          }, 0);
          templateTotal += sets.length;
          templateDoneCount += completedSets;
          if (nextExercises[templateExerciseId] === undefined) {
            const isExerciseDone = sets.length > 0 && completedSets >= sets.length;
            nextExercises[templateExerciseId] = !isExerciseDone;
            changed = true;
          }
        });
        const templateDone = templateTotal > 0 && templateDoneCount >= templateTotal;
        if (nextTemplates[template.id] === undefined) {
          nextTemplates[template.id] = !templateDone;
          changed = true;
        }
      });
    });

    if (changed) {
      setExpandedFolders(nextFolders);
      setExpandedTemplates(nextTemplates);
      setExpandedExercises(nextExercises);
    }
  }, [data?.folders, expansionHydrated, expandedExercises, expandedFolders, expandedTemplates, logsBySet, normalizeSets, statsByFolder]);

  useEffect(() => {
    if (!expansionHydrated) return;
    AsyncStorage.setItem(
      EXPANSION_STORAGE_KEY,
      JSON.stringify({
        folders: expandedFolders,
        templates: expandedTemplates,
        exercises: expandedExercises,
      }),
    ).catch(() => null);
  }, [expandedExercises, expandedFolders, expandedTemplates, expansionHydrated]);

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
              {stats.total > 0 && stats.done >= stats.total ? <CheckIcon color={colors.success} /> : null}
              <Text style={styles.folderTitle}>{item.name}</Text>
            </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.progressPill}>{stats.done}/{stats.total}</Text>
            {/* Не показываем негативный статус для активной программы в чеклисте */}
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
                  recsQuery.data.map(rec => {
                    const values = recInputs[rec.id] || { reps: '', weight: '' };
                    return (
                      <View key={rec.id} style={styles.recCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.exerciseTitle}>{rec.exercise_name || 'Упражнение'}</Text>
                          <InfoIcon border={colors.border} stroke={colors.muted} />
                        </View>
                        {rec.note ? <Text style={styles.muted}>{rec.note}</Text> : null}
                        <View style={styles.planRow}>
                          <AdjustNumber
                            label="Повторы"
                            value={values.reps}
                            onChange={text =>
                              setRecInputs(prev => ({ ...prev, [rec.id]: { ...(prev[rec.id] || {}), reps: text } }))
                            }
                          />
                          <AdjustNumber
                            label="Вес"
                            value={values.weight}
                            onChange={text =>
                              setRecInputs(prev => ({ ...prev, [rec.id]: { ...(prev[rec.id] || {}), weight: text } }))
                            }
                            inputMode="decimal"
                            step={2}
                          />
                        </View>
                        <Pressable
                          style={styles.recApply}
                          onPress={() =>
                            applyRecMutation.mutate({
                              ...rec,
                              change: {
                                reps: parseNumber(values.reps),
                                weight: parseNumber(values.weight),
                              },
                            })
                          }
                          disabled={applyRecMutation.isLoading}>
                          <Text style={styles.recApplyText}>Применить</Text>
                        </Pressable>
                      </View>
                    );
                  })
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
        <TouchableOpacity activeOpacity={0.8} style={styles.headerRow} onPress={() => setCalendarOpen(true)}>
          <View style={styles.header}>
            <Text style={styles.label}>Дневной чеклист</Text>
            <Text style={styles.title}>{dateText || 'Сегодня'}</Text>
            {!online ? (
              <Text style={styles.offlineNote}>
                Офлайн: отметки сохранятся в очереди и отправятся позже.
              </Text>
            ) : null}
            {queueCount > 0 || queueSyncing || queueError ? (
              <View style={styles.queueBanner}>
                <Text style={styles.queueText}>
                  {queueSyncing
                    ? 'Синхронизируем очередь...'
                    : queueError
                      ? `Очередь: ${queueError}`
                      : `В очереди ${queueCount} подход(ов) — отправим при появлении интернета.`}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{Math.round(dailyLoad)}</Text>
            <Text style={styles.summaryLabel}>нагрузка за день</Text>
          </View>
        </TouchableOpacity>

        {collectMuscles.length > 0 ? (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.tagCard}
            onPress={() => setCalendarOpen(true)}
          >
            <Text style={styles.tagLabel}>Работаем над</Text>
            <View style={styles.tagsRow}>
              {collectMuscles.slice(0, 6).map(([muscle, count]) => (
                <View key={muscle} style={styles.tagPill}>
                  <Text style={styles.tagText}>
                    {muscle}
                    {count > 1 ? ` ×${count}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
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
        visible={restOverlay.visible}
        duration={restOverlay.rest || 60}
        hasTime={restOverlay.hasTime}
        hasWeight={restOverlay.hasWeight}
        initialReps={restOverlay.initialReps}
        initialWeight={restOverlay.initialWeight}
        initialTime={restOverlay.initialTime}
        values={restValues}
        onChange={(field, value) => setRestValues(prev => ({ ...prev, [field]: value }))}
        onSkip={handleRestSkip}
        onFinish={handleRestFinish}
      />
      <ExecutionOverlay
        visible={execOverlay.visible}
        exerciseName={execOverlay.exerciseName}
        duration={execOverlay.duration}
        onCancel={() => setExecOverlay(prev => ({ ...prev, visible: false }))}
        onFinishEarly={handleExecutionFinish}
      />
      <Modal transparent visible={editModal.visible} animationType="fade" onRequestClose={closeEditModal}>
        <View style={styles.dateModalBackdrop}>
          <View style={[styles.dateModalCard, { maxWidth: 420 }]}>
            <Text style={styles.title}>Редактирование подхода</Text>
            <Text style={styles.muted}>{editModal.exerciseName}</Text>
            {!editModal.hasTime ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Повторы"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  value={editModal.values?.reps || ''}
                  onChangeText={value => setEditModal(prev => ({ ...prev, values: { ...(prev.values || {}), reps: value } }))}
                />
                {editModal.hasWeight ? (
                  <TextInput
                    style={styles.input}
                    placeholder="Вес (кг)"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={editModal.values?.weight || ''}
                    onChangeText={value => setEditModal(prev => ({ ...prev, values: { ...(prev.values || {}), weight: value } }))}
                  />
                ) : null}
              </>
            ) : (
              <TextInput
                style={styles.input}
                placeholder="Время (сек)"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={editModal.values?.time || ''}
                onChangeText={value => setEditModal(prev => ({ ...prev, values: { ...(prev.values || {}), time: value } }))}
              />
            )}
            <View style={styles.row}>
              <Pressable style={styles.secondary} onPress={closeEditModal}>
                <Text style={styles.secondaryText}>Отмена</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={handleEditDelete}>
                <Text style={styles.secondaryText}>Удалить</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={handleEditSave}>
                <Text style={styles.primaryText}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal transparent visible={infoModal.visible} animationType="fade" onRequestClose={() => setInfoModal({ visible: false })}>
        <View style={styles.dateModalBackdrop}>
          <View style={[styles.dateModalCard, { maxWidth: 520 }]}>
            <Text style={styles.title}>{infoModal.name}</Text>
            {infoModal.muscles ? <Text style={styles.muted}>Мышцы: {infoModal.muscles}</Text> : null}
            {infoModal.difficulty ? <Text style={styles.muted}>Сложность: {infoModal.difficulty}</Text> : null}
            {infoModal.description ? <Text style={styles.muted}>{infoModal.description}</Text> : null}
            {infoModal.images && infoModal.images.length > 0 ? (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {infoModal.images.map(img => (
                  <Image
                    key={img.order}
                    source={{ uri: buildExerciseImageUrl(img.path) }}
                    style={styles.infoImage}
                    resizeMode="contain"
                  />
                ))}
              </ScrollView>
            ) : null}
            <View style={styles.row}>
              <Pressable
                style={styles.primary}
                onPress={() => {
                  setInfoModal({ visible: false });
                  navigation.navigate('Programs' as never);
                }}>
                <Text style={styles.primaryText}>К ProgramBoard</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => setInfoModal({ visible: false })}>
                <Text style={styles.secondaryText}>Закрыть</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
                    const prev = formatISODate(new Date(current.getFullYear(), current.getMonth() - 1, 1));
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
                    const next = formatISODate(new Date(current.getFullYear(), current.getMonth() + 1, 1));
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

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
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
  queueBanner: {
    marginTop: 4,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#0f1f15',
    borderWidth: 1,
    borderColor: colors.border,
  },
  queueText: {
    color: colors.muted,
    fontSize: 12,
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
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 120,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  summaryDate: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  tagCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  tagLabel: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primary + '10',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  tagText: {
    color: colors.primary,
    fontSize: 11,
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
  planRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  factInputs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
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
    justifyContent: 'space-between',
    rowGap: 8,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.75,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
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
    fontSize: 11,
    lineHeight: 14,
  },
  dayLoadSelected: {
    color: colors.primary,
  },
  infoImage: {
    width: 280,
    height: 220,
    marginRight: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  secondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  secondaryText: {
    color: colors.muted,
    fontFamily: 'Inter-SemiBold',
  },
  primary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  primaryText: {
    color: colors.primaryText,
    fontFamily: 'Inter-Bold',
  },
});
