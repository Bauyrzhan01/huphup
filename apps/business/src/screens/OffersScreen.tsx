import { useCallback, useState } from 'react';
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
import { offersApi, type CompanyOffer, type OfferStatus } from '../api/leads';
import { Badge, ScreenHeader } from '../components/ui';
import { formatDate, formatMoney } from '../format';
import { colors, radius } from '../theme';

export const OFFER_STATUS: Record<OfferStatus, { label: string; bg: string; fg: string }> = {
  PENDING: { label: 'Ждёт ответа', bg: colors.amberSoft, fg: colors.amber },
  ACCEPTED: { label: 'Принято', bg: colors.greenSoft, fg: colors.green },
  REJECTED: { label: 'Отклонено', bg: '#fdecec', fg: '#b42318' },
  WITHDRAWN: { label: 'Отозвано', bg: colors.soft, fg: colors.muted },
};

export function OffersScreen() {
  const [offers, setOffers] = useState<CompanyOffer[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOffers(await offersApi.list());
      setError('');
    } catch {
      setOffers((prev) => prev ?? []);
      setError('Не удалось загрузить предложения. Потяните вниз, чтобы обновить.');
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
      <ScreenHeader title="Мои предложения" />
      {offers === null ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            error ? null : (
              <Text style={styles.empty}>
                Предложений пока нет. Откройте заявку во вкладке «Заявки» и назовите свою цену.
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              // The lead screen also resolves a request id, which is what an offer knows.
              onPress={() => router.push(`/leads/${item.request.id}`)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.code}>{item.request.code}</Text>
                <Badge {...OFFER_STATUS[item.status]} />
                <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {item.request.title}
              </Text>
              <Text style={styles.price}>
                {formatMoney(item.price, item.currency)}
                {item.deliveryDays !== null ? (
                  <Text style={styles.meta}>{`  ·  доставка ${item.deliveryDays} дн.`}</Text>
                ) : null}
              </Text>
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
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  error: { color: colors.amber, fontSize: 13, marginBottom: 8 },
  empty: { fontSize: 13, lineHeight: 19, color: '#555', padding: 4 },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, gap: 6 },
  pressed: { backgroundColor: colors.soft },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { fontSize: 12, fontWeight: '800', color: colors.text },
  date: { marginLeft: 'auto', fontSize: 11, color: colors.muted },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  price: { fontSize: 17, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, fontWeight: '500', color: colors.muted },
});
