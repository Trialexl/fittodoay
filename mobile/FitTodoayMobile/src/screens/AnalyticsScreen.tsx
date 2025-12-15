import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../components/Screen';
import { useToken } from '../hooks/useToken';
import { useThemedColors } from '../theme/colors';
import {
  fetchDailyLoad,
  fetchProgramTrends,
  fetchTopExercises,
  DailyLoadItem,
  ProgramTrendsResponse,
} from '../api/analytics';
import { notifyError } from '../utils/notify';
import { MainTabParamList } from '../navigation/types';

const ranges = [
  { label: 'Неделя', value: 'week' },
  { label: 'Месяц', value: 'month' },
  { label: 'Полгода', value: 'half-year' },
  { label: 'Год', value: 'year' },
];

export function AnalyticsScreen() {
  const colors = useThemedColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const token = useToken();
  const navigation = useNavigation<any>();
  const [range, setRange] = useState(ranges[0].value);
  const [trendView, setTrendView] = useState<'programs' | 'exercises'>('programs');
  const [granularity, setGranularity] = useState<'day' | 'week'>('day');
  const [topSort, setTopSort] = useState<'volume' | 'sets'>('volume');
  const [chartType, setChartType] = useState<'line' | 'area' | 'stacked' | 'columns' | 'heatmap' | 'pie' | 'radar' | 'scatter'>('line');
  const [activeSeries, setActiveSeries] = useState<string | number | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<number | null>(null);

  const dailyQuery = useQuery({
    queryKey: ['dailyLoad'],
    queryFn: () => {
      if (!token) throw new Error('Нет токена');
      return fetchDailyLoad(token);
    },
    enabled: Boolean(token),
    onError: (err: any) => notifyError(err?.message || 'Не удалось загрузить дневную нагрузку'),
  });

  const topQuery = useQuery({
    queryKey: ['topExercises'],
    queryFn: () => {
      if (!token) throw new Error('Нет токена');
      return fetchTopExercises(token);
    },
    enabled: Boolean(token),
    onError: (err: any) => notifyError(err?.message || 'Не удалось загрузить топ упражнений'),
  });

  const trendQuery = useQuery({
    queryKey: ['programTrends', range, trendView, granularity],
    queryFn: () => {
      if (!token) throw new Error('Нет токена');
      return fetchProgramTrends(token, range, trendView, granularity);
    },
    enabled: Boolean(token),
    onError: (err: any) => notifyError(err?.message || 'Не удалось загрузить динамику программ'),
  });

  const refreshing = dailyQuery.isFetching || topQuery.isFetching || trendQuery.isFetching;

  const folders = React.useMemo(
    () => (trendQuery.data?.folders || []) as ProgramTrendsResponse['folders'],
    [trendQuery.data?.folders],
  );

  React.useEffect(() => {
    if (!folders.length) {
      setActiveFolderId(null);
      return;
    }
    if (activeFolderId === null || !folders.some(f => f.id === activeFolderId)) {
      setActiveFolderId(folders[0].id);
    }
  }, [folders, activeFolderId]);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              dailyQuery.refetch();
              topQuery.refetch();
              trendQuery.refetch();
            }}
            tintColor={colors.primary}
          />
        }>
        <View style={styles.header}>
          <Text style={styles.title}>Аналитика</Text>
          <Text style={styles.subtitle}>Нагрузка, топ упражнений и динамика по программам</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Дневная нагрузка</Text>
          {dailyQuery.isLoading ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <SkeletonBox width={90} />
              <SkeletonBox width={90} />
              <SkeletonBox width={90} />
            </View>
          ) : (
            <FlatList
              data={dailyQuery.data || []}
              keyExtractor={item => item.date}
              horizontal
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
              renderItem={({ item }) => (
                <Pressable onPress={() => navigation.navigate('Workout' as keyof MainTabParamList, { date: item.date })}>
                  <DailyCard item={item} />
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.muted}>Нет данных</Text>}
            />
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Топ упражнений</Text>
            <View style={styles.rangeSwitch}>
              {['volume', 'sets'].map(key => (
                <Pressable
                  key={key}
                  style={[styles.rangeButton, topSort === key && styles.rangeButtonActive]}
                  onPress={() => setTopSort(key as 'volume' | 'sets')}>
                  <Text style={[styles.rangeText, topSort === key && styles.rangeTextActive]}>
                    {key === 'volume' ? 'Объём' : 'Сеты'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {topQuery.isLoading ? (
            <View style={{ gap: 8 }}>
              <SkeletonBox />
              <SkeletonBox />
              <SkeletonBox />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {((topQuery.data as any)?.items || topQuery.data || [])
                .slice()
                .sort((a: any, b: any) => (topSort === 'volume' ? b.volume - a.volume : b.sets - a.sets))
                .map((ex: any) => (
                  <View key={ex.exercise || ex.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{ex.exercise || ex.name}</Text>
                    <Text style={styles.muted}>Объем: {ex.volume} • Сеты: {ex.sets}</Text>
                    <Pressable style={styles.link} onPress={() => navigation.navigate('Programs' as keyof MainTabParamList)}>
                      <Text style={styles.linkText}>Открыть в ProgramBoard</Text>
                    </Pressable>
                  </View>
                ))}
              {!((topQuery.data as any)?.items || topQuery.data || []).length ? <Text style={styles.muted}>Нет данных</Text> : null}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Динамика по программам</Text>
            <View style={styles.rangeSwitch}>
              {ranges.map(r => (
                <Pressable
                  key={r.value}
                  style={[
                    styles.rangeButton,
                    range === r.value && styles.rangeButtonActive,
                  ]}
                  onPress={() => setRange(r.value)}>
                  <Text
                    style={[
                      styles.rangeText,
                      range === r.value && styles.rangeTextActive,
                    ]}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.rangeSwitch}>
            {['programs', 'exercises'].map(v => (
              <Pressable
                key={v}
                style={[styles.rangeButton, trendView === v && styles.rangeButtonActive]}
                onPress={() => setTrendView(v as 'programs' | 'exercises')}>
                <Text style={[styles.rangeText, trendView === v && styles.rangeTextActive]}>
                  {v === 'programs' ? 'Программы' : 'Упражнения'}
                </Text>
              </Pressable>
            ))}
            {['day', 'week'].map(v => (
              <Pressable
                key={v}
                style={[styles.rangeButton, granularity === v && styles.rangeButtonActive]}
                onPress={() => setGranularity(v as 'day' | 'week')}>
                <Text style={[styles.rangeText, granularity === v && styles.rangeTextActive]}>
                  {v === 'day' ? 'Дни' : 'Недели'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.rangeSwitch}>
            {['line', 'area', 'stacked', 'columns', 'heatmap', 'pie', 'radar', 'scatter'].map(type => (
              <Pressable
                key={type}
                style={[styles.rangeButton, chartType === type && styles.rangeButtonActive]}
                onPress={() => setChartType(type as typeof chartType)}>
                <Text style={[styles.rangeText, chartType === type && styles.rangeTextActive]}>{type}</Text>
              </Pressable>
            ))}
          </View>
          {trendView === 'exercises' && folders.length > 0 ? (
            <View style={styles.rangeSwitch}>
              {folders.map(folder => (
                <Pressable
                  key={folder.id}
                  style={[styles.rangeButton, activeFolderId === folder.id && styles.rangeButtonActive]}
                  onPress={() => setActiveFolderId(folder.id)}>
                  <Text style={[styles.rangeText, activeFolderId === folder.id && styles.rangeTextActive]}>
                    {folder.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {trendQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : trendQuery.data ? (
            <TrendCharts
              data={trendQuery.data}
              chartType={chartType}
              activeSeries={activeSeries}
              onSelectSeries={setActiveSeries}
              view={trendView}
              activeFolderId={activeFolderId}
              granularity={granularity}
            />
          ) : (
            <Text style={styles.muted}>Нет данных</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AI feed (скоро)</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Персональные инсайты</Text>
            <Text style={styles.muted}>
              Скоро ассистент будет подсказывать, что улучшить в программе и какие тренировки добавить.
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function DailyCard({ item }: { item: DailyLoadItem }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.date}</Text>
      <Text style={styles.muted}>Объем: {item.volume}</Text>
      <Text style={styles.muted}>Сеты: {item.sets}</Text>
    </View>
  );
}

function SkeletonBox({ width = 160 }: { width?: number }) {
  return <View style={[styles.card, { width, backgroundColor: '#11171f', borderColor: '#1c2633' }]} />;
}

type TrendChartsProps = {
  data: ProgramTrendsResponse;
  chartType: 'line' | 'area' | 'stacked' | 'columns' | 'heatmap' | 'pie' | 'radar' | 'scatter';
  activeSeries: string | number | null;
  onSelectSeries: (key: string | number | null) => void;
  view: 'programs' | 'exercises';
  activeFolderId: number | null;
  granularity: 'day' | 'week';
};

type ChartSeries = {
  key: string | number;
  label: string;
  color: string;
  points: { iso: string; value: number | null }[];
};

const chartColors = ['#7c3aed', '#f97316', '#0ea5e9', '#22c55e', '#f973ab', '#94a3b8', '#facc15', '#14b8a6'];

const parseISODate = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const formatLabelDate = (iso: string, granularity: 'day' | 'week') => {
  const base = parseISODate(iso);
  if (granularity === 'week') {
    const end = new Date(base);
    end.setDate(end.getDate() + 6);
    return `${String(base.getDate()).padStart(2, '0')}.${String(base.getMonth() + 1).padStart(2, '0')}–${String(end.getDate()).padStart(2, '0')}.${String(end.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${String(base.getDate()).padStart(2, '0')}.${String(base.getMonth() + 1).padStart(2, '0')}`;
};

const interpolateValues = (values: Array<number | null>) => {
  if (!values.length) return [];
  const result = [...values];
  let firstIdx = result.findIndex(v => v !== null && v !== undefined);
  if (firstIdx === -1) return result.map(() => 0);
  const firstVal = result[firstIdx] as number;
  for (let i = 0; i < firstIdx; i += 1) result[i] = firstVal;
  let lastKnownIdx = firstIdx;
  for (let i = firstIdx + 1; i < result.length; i += 1) {
    if (result[i] === null || result[i] === undefined) {
      let nextIdx = i + 1;
      while (nextIdx < result.length && (result[nextIdx] === null || result[nextIdx] === undefined)) nextIdx += 1;
      if (nextIdx < result.length) {
        const prevVal = result[lastKnownIdx] as number;
        const nextVal = result[nextIdx] as number;
        const gap = nextIdx - lastKnownIdx;
        const step = (nextVal - prevVal) / gap;
        for (let fill = 1; fill < gap; fill += 1) {
          result[lastKnownIdx + fill] = prevVal + step * fill;
        }
        i = nextIdx - 1;
        lastKnownIdx = nextIdx;
      } else {
        const prevVal = result[lastKnownIdx] as number;
        for (let fill = lastKnownIdx + 1; fill < result.length; fill += 1) result[fill] = prevVal;
        break;
      }
    } else {
      lastKnownIdx = i;
    }
  }
  return result as number[];
};

function TrendCharts({ data, chartType, activeSeries, onSelectSeries, view, activeFolderId, granularity }: TrendChartsProps) {
  const [tooltip, setTooltip] = useState<{ series: string; label: string; value: number } | null>(null);
  const series: ChartSeries[] = useMemo(() => {
    const folders = data?.folders || [];
    if (!folders.length) return [];
    if (view === 'programs') {
      return folders.map((folder, index) => ({
        key: folder.id,
        label: folder.name,
        color: chartColors[index % chartColors.length],
        points: (folder.series || []).map(pt => ({ iso: pt.date, value: pt.load })),
      }));
    }
    const folder = activeFolderId ? folders.find(f => f.id === activeFolderId) : folders[0];
    if (!folder) return [];
    return (folder.exercises || []).map((exercise, index) => ({
      key: exercise.template_exercise_id,
      label: exercise.exercise_name || exercise.template_name || `Упражнение ${index + 1}`,
      color: chartColors[index % chartColors.length],
      points: (exercise.series || []).map(pt => ({ iso: pt.date, value: pt.load })),
    }));
  }, [activeFolderId, data?.folders, view]);

  const isoList = useMemo(() => {
    const set = new Set<string>();
    series.forEach(s => s.points.forEach(p => set.add(p.iso)));
    return Array.from(set).sort((a, b) => parseISODate(a).getTime() - parseISODate(b).getTime());
  }, [series]);

  const normalizedSeries = useMemo(() => {
    return series.map(s => {
      const timeline = isoList.map(iso => s.points.find(p => p.iso === iso)?.value ?? null);
      const interpolated = interpolateValues(timeline);
      return {
        ...s,
        points: isoList.map((iso, idx) => ({ iso, value: interpolated[idx] ?? 0 })),
      };
    });
  }, [isoList, series]);

  if (!normalizedSeries.length) {
    return <Text style={styles.muted}>Нет данных</Text>;
  }

  const focused = activeSeries ? normalizedSeries.filter(s => s.key === activeSeries) : normalizedSeries;
  const maxValue = focused.reduce((acc, s) => {
    const localMax = s.points.reduce((mx, pt) => Math.max(mx, pt.value || 0), 0);
    return Math.max(acc, localMax);
  }, 0);

  const handleSelect = (key: string | number | null) => {
    if (activeSeries === key) {
      onSelectSeries(null);
    } else {
      onSelectSeries(key);
    }
  };

  if (chartType === 'pie') {
    const totals = focused.map(s => ({
      key: s.key,
      label: s.label,
      color: s.color,
      total: s.points.reduce((acc, pt) => acc + (pt.value || 0), 0),
    }));
    const grandTotal = totals.reduce((acc, s) => acc + s.total, 0) || 1;
    return (
      <View style={{ marginTop: 10, gap: 10 }}>
        {totals.map(slice => (
          <Pressable key={slice.key} style={styles.sliceRow} onPress={() => handleSelect(slice.key)}>
            <View style={[styles.sliceDot, { backgroundColor: slice.color, opacity: activeSeries && activeSeries !== slice.key ? 0.35 : 1 }]} />
            <Text style={[styles.cardTitle, activeSeries && activeSeries !== slice.key ? styles.muted : null]}>{slice.label}</Text>
            <Text style={styles.mutedSmall}>{Math.round((slice.total / grandTotal) * 100)}%</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  if (chartType === 'heatmap') {
    return (
      <View style={{ gap: 8, marginTop: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'column', gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {isoList.map(iso => (
                <Text key={iso} style={styles.heatmapLabel}>{formatLabelDate(iso, granularity)}</Text>
              ))}
            </View>
            {normalizedSeries.map(seriesItem => (
              <View key={seriesItem.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.mutedSmall, { width: 80 }]} numberOfLines={1}>
                  {seriesItem.label}
                </Text>
                {seriesItem.points.map(pt => {
                  const intensity = maxValue ? Math.min(1, (pt.value || 0) / maxValue) : 0;
                  return (
                    <Pressable
                      key={`${seriesItem.key}-${pt.iso}`}
                      onPress={() => handleSelect(seriesItem.key)}
                      style={[
                        styles.heatmapCell,
                        { backgroundColor: `${seriesItem.color}33`, opacity: 0.35 + intensity * 0.65, borderColor: seriesItem.color },
                        activeSeries && activeSeries !== seriesItem.key ? { opacity: 0.25 } : null,
                      ]}
                    >
                      <Text style={styles.heatmapValue}>{Math.round(pt.value || 0)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  const renderBars = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        {isoList.map((iso, idx) => {
          const values = focused.map(s => s.points[idx]?.value || 0);
          const isoTotal = values.reduce((a, b) => a + b, 0);
          return (
            <View key={iso} style={{ alignItems: 'center', gap: 4 }}>
              {chartType === 'stacked' ? (
                <View style={[styles.barStack, { height: 140 }]}>
                  {focused.map(s => {
                    const val = s.points[idx]?.value || 0;
                    const height = maxValue ? (val / maxValue) * 140 : 0;
                    return (
                      <Pressable
                        key={`${s.key}-${iso}`}
                        style={[styles.barSegment, { height, backgroundColor: s.color, opacity: activeSeries && activeSeries !== s.key ? 0.35 : 1 }]}
                        onPress={() => {
                          handleSelect(s.key);
                          setTooltip({ series: s.label, label: formatLabelDate(iso, granularity), value: Math.round(val) });
                        }}
                      />
                    );
                  })}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 4, alignItems: 'flex-end' }}>
                  {focused.map(s => {
                    const val = s.points[idx]?.value || 0;
                    const height = maxValue ? (val / maxValue) * 140 : 0;
                    return (
                      <Pressable
                        key={`${s.key}-${iso}`}
                        style={[styles.bar, { height: Math.max(6, height), backgroundColor: s.color, opacity: activeSeries && activeSeries !== s.key ? 0.35 : 1 }]}
                        onPress={() => {
                          handleSelect(s.key);
                          setTooltip({ series: s.label, label: formatLabelDate(iso, granularity), value: Math.round(val) });
                        }}
                      />
                    );
                  })}
                </View>
              )}
              <Text style={styles.barLabel}>{formatLabelDate(iso, granularity)}</Text>
              <Text style={styles.mutedSmall}>{chartType === 'stacked' ? Math.round(isoTotal) : ''}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderLines = () => (
    <View style={{ gap: 10, marginTop: 10 }}>
      {focused.map(seriesItem => (
        <View key={seriesItem.key} style={{ gap: 6 }}>
          <Pressable style={styles.seriesHeader} onPress={() => handleSelect(seriesItem.key)}>
            <View style={[styles.seriesDot, { backgroundColor: seriesItem.color }]} />
            <Text style={[styles.cardTitle, activeSeries && activeSeries !== seriesItem.key ? styles.muted : null]}>{seriesItem.label}</Text>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {seriesItem.points.map(pt => (
                <Pressable
                  key={`${seriesItem.key}-${pt.iso}`}
                  onPress={() => {
                    handleSelect(seriesItem.key);
                    setTooltip({ series: seriesItem.label, label: formatLabelDate(pt.iso, granularity), value: Math.round(pt.value || 0) });
                  }}
                  style={{ alignItems: 'center', gap: 4 }}>
                  <View style={[styles.point, { backgroundColor: seriesItem.color, opacity: activeSeries && activeSeries !== seriesItem.key ? 0.35 : 1 }]} />
                  <Text style={styles.mutedSmall}>{Math.round(pt.value || 0)}</Text>
                  <Text style={styles.barLabel}>{formatLabelDate(pt.iso, granularity)}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
    </View>
  );

  const renderRadar = () => {
    const totals = focused.map(s => ({
      key: s.key,
      label: s.label,
      avg: s.points.reduce((acc, pt) => acc + (pt.value || 0), 0) / (s.points.length || 1),
      color: s.color,
    }));
    return (
      <View style={{ gap: 8, marginTop: 8 }}>
        {totals.map(item => (
          <Pressable key={item.key} style={styles.sliceRow} onPress={() => handleSelect(item.key)}>
            <View style={[styles.sliceDot, { backgroundColor: item.color }]} />
            <Text style={[styles.cardTitle, activeSeries && activeSeries !== item.key ? styles.muted : null]}>{item.label}</Text>
            <Text style={styles.mutedSmall}>avg: {Math.round(item.avg)}</Text>
          </Pressable>
        ))}
      </View>
    );
  };

  if (chartType === 'columns' || chartType === 'stacked') {
    return renderBars();
  }

  if (chartType === 'radar') {
    return renderRadar();
  }

  return (
    <View>
      {renderLines()}
      {tooltip ? (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{tooltip.series}: {tooltip.value} • {tooltip.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useThemedColors>) =>
  StyleSheet.create({
  header: {
    gap: 6,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    color: colors.muted,
  },
  section: {
    marginTop: 14,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  card: {
    minWidth: 140,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  muted: {
    color: colors.muted,
  },
  mutedSmall: {
    color: colors.muted,
    fontSize: 12,
  },
  rangeSwitch: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rangeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rangeButtonActive: {
    backgroundColor: colors.primary + '22',
  },
  rangeText: {
    color: colors.muted,
    fontSize: 13,
  },
  rangeTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  heatmapLabel: {
    color: colors.muted,
    fontSize: 11,
    minWidth: 64,
    textAlign: 'center',
  },
  heatmapCell: {
    minWidth: 64,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  heatmapValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  sliceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  sliceDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  barItem: {
    alignItems: 'center',
    gap: 4,
  },
  bar: {
    width: 22,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  barStack: {
    width: 30,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  barSegment: {
    width: '100%',
  },
  barLabel: {
    color: colors.muted,
    fontSize: 11,
    textAlign: 'center',
    width: 64,
  },
  seriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seriesDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  point: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  link: {
    marginTop: 6,
  },
  linkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  tooltip: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tooltipText: {
    color: colors.text,
    fontSize: 13,
  },
  });
