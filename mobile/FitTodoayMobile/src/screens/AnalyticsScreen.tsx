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
import { colors } from '../theme/colors';
import {
  fetchDailyLoad,
  fetchProgramTrends,
  fetchTopExercises,
  DailyLoadItem,
  TopExerciseItem,
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
  const token = useToken();
  const navigation = useNavigation<any>();
  const [range, setRange] = useState(ranges[0].value);
  const [trendView, setTrendView] = useState<'programs' | 'exercises'>('programs');
  const [granularity, setGranularity] = useState<'day' | 'week'>('day');
  const [topSort, setTopSort] = useState<'volume' | 'sets'>('volume');
  const [chartType, setChartType] = useState<'line' | 'area' | 'stacked' | 'columns' | 'pie' | 'radar' | 'scatter'>('line');
  const [activeSeries, setActiveSeries] = useState<string | number | null>(null);

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
              {(topQuery.data || [])
                .slice()
                .sort((a, b) => (topSort === 'volume' ? b.volume - a.volume : b.sets - a.sets))
                .map(ex => (
                  <View key={ex.exercise} style={styles.card}>
                    <Text style={styles.cardTitle}>{ex.exercise}</Text>
                    <Text style={styles.muted}>Объем: {ex.volume} • Сеты: {ex.sets}</Text>
                    <Pressable style={styles.link} onPress={() => navigation.navigate('Programs' as keyof MainTabParamList)}>
                      <Text style={styles.linkText}>Открыть в ProgramBoard</Text>
                    </Pressable>
                  </View>
                ))}
              {!topQuery.data?.length ? <Text style={styles.muted}>Нет данных</Text> : null}
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
            {['line', 'area', 'stacked', 'columns', 'pie', 'radar', 'scatter'].map(type => (
              <Pressable
                key={type}
                style={[styles.rangeButton, chartType === type && styles.rangeButtonActive]}
                onPress={() => setChartType(type as typeof chartType)}>
                <Text style={[styles.rangeText, chartType === type && styles.rangeTextActive]}>{type}</Text>
              </Pressable>
            ))}
          </View>
          {trendQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : trendQuery.data ? (
            <TrendCharts
              data={trendQuery.data}
              chartType={chartType}
              activeSeries={activeSeries}
              onSelectSeries={setActiveSeries}
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
  chartType: 'line' | 'area' | 'stacked' | 'columns' | 'pie' | 'radar' | 'scatter';
  activeSeries: string | number | null;
  onSelectSeries: (key: string | number | null) => void;
};

function TrendCharts({ data, chartType, activeSeries, onSelectSeries }: TrendChartsProps) {
  const series = useMemo(() => {
    if (!data?.points?.length) return [];
    // mobile backend: points already aggregated; use label/volume as simple series
    return [
      {
        key: 'volume',
        label: 'Объем',
        color: colors.primary,
        points: data.points.map(p => ({ x: p.label, y: p.volume })),
      },
    ];
  }, [data]);

  if (!series.length) {
    return <Text style={styles.muted}>Нет данных</Text>;
  }

  const renderPoint = (pt: { x: string | number; y: number }, idx: number, color: string) => (
    <View key={`${pt.x}-${idx}`} style={{ alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
          opacity: activeSeries && activeSeries !== 'volume' ? 0.4 : 1,
        }}
      />
      <Text style={styles.mutedSmall}>{pt.y}</Text>
      <Text style={styles.barLabel}>{pt.x}</Text>
    </View>
  );

  if (chartType === 'pie') {
    const total = series[0].points.reduce((acc, p) => acc + p.y, 0) || 1;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <View style={{ width: 140, height: 140, borderRadius: 70, overflow: 'hidden', backgroundColor: colors.surface }}>
          {series[0].points.reduce<{ start: number; slices: { key: string; start: number; end: number; color: string }[] }>(
            (acc, pt, idx) => {
              const slice = pt.y / total;
              const nextStart = acc.start + slice;
              acc.slices.push({ key: `${pt.x}-${idx}`, start: acc.start, end: nextStart, color: colors.primary });
              acc.start = nextStart;
              return acc;
            },
            { start: 0, slices: [] },
          ).slices.map(slice => (
            <View key={slice.key} style={{ position: 'absolute', inset: 0, transform: [{ rotate: `${slice.start * 360}deg` }] }}>
              <View
                style={{
                  position: 'absolute',
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  borderWidth: 70,
                  borderColor: colors.primary,
                  borderRightColor: 'transparent',
                  borderBottomColor: 'transparent',
                  transform: [{ rotate: `${(slice.end - slice.start) * 360}deg` }],
                }}
              />
            </View>
          ))}
        </View>
        <View style={{ gap: 6 }}>
          {series[0].points.map((pt, idx) => (
            <Text key={`${pt.x}-${idx}`} style={styles.muted}>
              {pt.x}: {pt.y}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  // default to bars/lines style rendering
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        {series[0].points.map((pt, idx) => (
          chartType === 'columns' || chartType === 'stacked' || chartType === 'bar' ? (
            <View key={`${pt.x}-${idx}`} style={styles.barItem}>
              <View
                style={[
                  styles.bar,
                  { height: Math.max(12, Math.min(140, pt.y / 10)), backgroundColor: colors.primary },
                ]}
              />
              <Text style={styles.barLabel}>{pt.x}</Text>
              <Text style={styles.mutedSmall}>{pt.y}</Text>
            </View>
          ) : (
            renderPoint({ x: pt.x, y: pt.y }, idx, colors.primary)
          )
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  barItem: {
    alignItems: 'center',
    gap: 4,
  },
  bar: {
    width: 26,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  barLabel: {
    color: colors.text,
    fontSize: 12,
  },
  mutedSmall: {
    color: colors.muted,
    fontSize: 12,
  },
  link: {
    marginTop: 6,
  },
  linkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
});
