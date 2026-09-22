import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { leadsApi, type Lead } from '../api/leads';
import { ScreenHeader } from '../components/ui';
import { formatDate } from '../format';
import { colors, radius } from '../theme';

type Filter = 'new' | 'offered' | 'archive';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'new', label: 'Новые' },
  { key: 'offered', label: 'С предложением' },
  { key: 'archive', label: 'Архив' },
];

function bucket(lead: Lead): Filter {
  if (lead.status === 'OFFERED') return 'offered';
  if (lead.status === 'SKIPPED' || lead.request.status !== 'PUBLISHED') return 'archive';
  return 'new';
}

export function leadMeta(lead: Lead) {
  const r = lead.request;
  return [r.city, r.quantity, r.deadline ? `до ${formatDate(r.deadline)}` : null]
    .filter(Boolean)
    .join(' · ');
}

export function LeadsScreen() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState<Filter>('new');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLeads(await leadsApi.list());
      setError('');
    } catch {
      setLeads((prev) => prev ?? []);
      setError('Не удалось загрузить заявки. Потяните вниз, чтобы обновить.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { new: 0, offered: 0, archive: 0 };
    for (const l of leads ?? []) c[bucket(l)] += 1;
    return c;
  }, [leads]);

  const visible = useMemo(() => (leads ?? []).filter((l) => bucket(l) === filter), [leads, filter]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Заявки покупателей" back={false} />
      <View style={styles.tabs}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.tab, filter === f.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, filter === f.key && styles.tabTextActive]}>
              {f.label}
              {counts[f.key] ? ` ${counts[f.key]}` : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      {leads === null ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            error ? null : (
              <Text style={styles.empty}>
                {filter === 'new'
                  ? 'Новых заявок нет. Как только покупатель опубликует подходящую заявку, она появится здесь.'
                  : filter === 'offered'
                    ? 'Вы ещё не отправляли предложений.'
                    : 'Архив пуст.'}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/leads/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardMain}>
                <View style={styles.cardTop}>
                  <Text style={styles.code}>{item.request.code}</Text>
                  {item.status === 'NEW' ? <View style={styles.dot} /> : null}
                  <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={[styles.title, item.status === 'NEW' && styles.titleNew]} numberOfLines={2}>
                  {item.request.title}
                </Text>
                {leadMeta(item) ? <Text style={styles.meta}>{leadMeta(item)}</Text> : null}
                {item.matchedProduct ? (
                  <Text style={styles.match} numberOfLines={1}>
                    Ваш товар: {item.matchedProduct.name}
                  </Text>
                ) : null}
              </View>
              <ChevronRight size={18} color="#b0b0b5" />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  tab: { backgroundColor: colors.soft, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8 },
  tabActive: { backgroundColor: colors.dark },
  tabText: { fontSize: 13, color: '#555', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  error: { color: colors.amber, fontSize: 13, marginBottom: 8 },
  empty: { fontSize: 13, lineHeight: 19, color: '#555', padding: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 14,
  },
  pressed: { backgroundColor: colors.soft },
  cardMain: { flex: 1, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  code: { fontSize: 12, fontWeight: '800', color: colors.text },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  date: { marginLeft: 'auto', fontSize: 11, color: colors.muted },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  titleNew: { fontWeight: '800' },
  meta: { fontSize: 12, color: colors.muted },
  match: { fontSize: 12, color: colors.green, fontWeight: '600' },
});
