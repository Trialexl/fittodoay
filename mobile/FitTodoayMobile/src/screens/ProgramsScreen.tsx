import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../components/Screen';
import { fetchProgramFolders } from '../api/programs';
import { useToken } from '../hooks/useToken';

export function ProgramsScreen() {
  const token = useToken();

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['programFolders'],
    queryFn: () => {
      if (!token) {
        throw new Error('Нет токена');
      }
      return fetchProgramFolders(token);
    },
    enabled: Boolean(token),
  });

  const renderItem = ({ item }: any) => (
    <View style={[styles.card, !item.is_active && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        {!item.is_active ? <Text style={styles.badge}>Не активна</Text> : null}
      </View>
      {item.comment ? <Text style={styles.cardDescription}>{item.comment}</Text> : null}
    </View>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Программы</Text>
        <Text style={styles.subtitle}>
          Активные папки и шаблоны. Переключение активности доступно в редакторе.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f2b200" />
        </View>
      ) : error ? (
        <Text style={styles.errorText}>Не удалось загрузить программы</Text>
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#f2b200" />
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<Text style={styles.empty}>Нет программ</Text>}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f5f7fb',
  },
  subtitle: {
    color: '#c3cad5',
    fontSize: 14,
  },
  card: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#0f1626',
    borderWidth: 1,
    borderColor: '#1e2740',
    gap: 6,
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
    color: '#f5f7fb',
    fontWeight: '700',
    fontSize: 18,
  },
  cardDescription: {
    color: '#c3cad5',
    fontSize: 14,
  },
  badge: {
    color: '#ffba08',
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#ff6b6b',
  },
  empty: {
    color: '#c3cad5',
    textAlign: 'center',
    marginTop: 12,
  },
});
