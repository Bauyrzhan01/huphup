import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { chatApi, type Conversation } from '../api/chat';
import { useAuth } from '../auth/AuthContext';
import { ScreenHeader } from '../components/requests';
import { formatDate } from '../requests/format';
import { colors, radius } from '../theme';

export function chatTitle(c: Conversation, myId: string | undefined) {
  const other = c.participants?.find((p) => p.id !== myId);
  return other?.companyName || other?.fullName || c.request?.title || 'Чат';
}

export function ChatsScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await chatApi.list());
      setError('');
    } catch {
      setError('Не удалось загрузить чаты. Потяните вниз, чтобы обновить.');
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
      <ScreenHeader title="Чаты" back={false} />
      {items === null ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            error ? null : (
              <Text style={styles.empty}>
                Чатов пока нет. Чат с поставщиком открывается, когда вы принимаете его предложение.
              </Text>
            )
          }
          renderItem={({ item }) => {
            const last = item.messages[0];
            const title = chatTitle(item, user?.id);
            return (
              <Pressable
                onPress={() => router.push(`/chats/${item.id}`)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{title.trim()[0]?.toUpperCase() ?? '·'}</Text>
                </View>
                <View style={styles.rowMain}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.date}>{formatDate(last?.createdAt ?? item.updatedAt)}</Text>
                  </View>
                  {item.request ? (
                    <Text style={styles.request} numberOfLines={1}>
                      {item.request.code} · {item.request.title}
                    </Text>
                  ) : null}
                  <Text style={styles.preview} numberOfLines={1}>
                    {last?.body || 'Сообщений пока нет'}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  content: { paddingVertical: 8, paddingBottom: 40 },
  error: { color: colors.amber, fontSize: 13, margin: 16 },
  empty: { fontSize: 13, lineHeight: 19, color: '#555', margin: 16 },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  rowPressed: { backgroundColor: colors.soft },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  rowMain: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  date: { fontSize: 11, color: colors.muted },
  request: { fontSize: 12, color: colors.muted },
  preview: { fontSize: 13, color: '#555' },
});
