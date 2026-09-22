import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { requestsApi, type RequestItem } from '../api/requests';
import { RequestRow, ScreenHeader } from '../components/requests';
import { colors, radius } from '../theme';

export function RequestsScreen() {
  const [items, setItems] = useState<RequestItem[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await requestsApi.list());
      setError('');
    } catch {
      setError('Не удалось загрузить заявки. Потяните вниз, чтобы обновить.');
      setItems((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Мои заявки" />
      {items === null ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            error ? null : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  Заявок пока нет. Опишите, что нужно, на главном экране — AI соберёт заявку.
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.cell,
                index === 0 && styles.cellFirst,
                index === items.length - 1 && styles.cellLast,
              ]}
            >
              <RequestRow request={item} last={index === items.length - 1} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  content: { padding: 16, paddingBottom: 40 },
  error: { color: colors.amber, fontSize: 13, marginBottom: 12 },
  cell: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  cellFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  cellLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  empty: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fafafa',
    borderRadius: radius.md,
    padding: 14,
  },
  emptyText: { fontSize: 13, lineHeight: 19, color: '#555' },
});
