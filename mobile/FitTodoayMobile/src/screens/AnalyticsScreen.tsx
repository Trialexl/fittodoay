import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from 'react-native';
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
} from '../api/analytics';
import { notifyError } from '../utils/notify';

const ranges = [
  { label: 'Неделя', value: 'week' },
  { label: 'Месяц', value: 'month' },
  { label: 'Полгода', value: 'half-year' },
  { label: 'Год', value: 'year' },
];

export function AnalyticsScreen() {
  const token = useToken();
  const [range, setRange] = useState(ranges[0].value);

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
    queryKey: ['programTrends', range],
    queryFn: () => {
      if (!token) throw new Error('Нет токена');
      return fetchProgramTrends(token, range);
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
            <ActivityIndicator color={colors.primary} />
          ) : (
            <FlatList
              data={dailyQuery.data || []}
              keyExtractor={item => item.date}
              horizontal
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
              renderItem={({ item }) => <DailyCard item={item} />}
              ListEmptyComponent={<Text style={styles.muted}>Нет данных</Text>}
            />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Топ упражнений</Text>
          {topQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={{ gap: 8 }}>
              {(topQuery.data || []).map(ex => (
                <View key={ex.exercise} style={styles.card}>
                  <Text style={styles.cardTitle}>{ex.exercise}</Text>
                  <Text style={styles.muted}>Объем: {ex.volume} • Сеты: {ex.sets}</Text>
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
          {trendQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : trendQuery.data?.points?.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                {trendQuery.data.points.map(point => (
                  <View key={point.label} style={styles.barItem}>
                    <View
                      style={[
                        styles.bar,
                        { height: Math.max(12, Math.min(140, point.volume / 10)) },
                      ]}
                    />
                    <Text style={styles.barLabel}>{point.label}</Text>
                    <Text style={styles.mutedSmall}>{point.volume}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text style={styles.muted}>Нет данных</Text>
          )}
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
});
