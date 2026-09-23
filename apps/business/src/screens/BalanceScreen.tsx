import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { walletApi, type Wallet, type WalletTransaction } from '../api/deals';
import { ScreenHeader } from '../components/ui';
import { formatDate, formatMoney } from '../format';
import { colors, radius } from '../theme';

export function BalanceScreen() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [items, setItems] = useState<WalletTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, tx] = await Promise.all([walletApi.me(), walletApi.transactions(1)]);
      setWallet(w);
      setItems(tx.items);
      setPage(1);
      setTotalPages(tx.totalPages);
      setError('');
    } catch {
      setError('Не удалось загрузить баланс. Потяните вниз, чтобы обновить.');
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

  async function loadMore() {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const tx = await walletApi.transactions(page + 1);
      setItems((prev) => [...prev, ...tx.items]);
      setPage(tx.page);
      setTotalPages(tx.totalPages);
    } catch {
      // keep what is shown; the next scroll retries
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Баланс компании" back={false} />
      {!wallet && !error ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {wallet ? (
                <View style={styles.hero}>
                  <Text style={styles.heroLabel}>ТЕКУЩИЙ ОСТАТОК</Text>
                  <Text style={styles.heroAmount}>{formatMoney(wallet.balance, wallet.currency)}</Text>
                  <Text style={styles.heroNote}>
                    Сюда приходят деньги по закрытым сделкам — за вычетом комиссии площадки.
                  </Text>
                </View>
              ) : null}
              <Text style={styles.section}>История операций</Text>
            </>
          }
          ListEmptyComponent={wallet ? <Text style={styles.empty}>Операций пока не было.</Text> : null}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.muted} /> : null}
          renderItem={({ item }) => {
            const credit = item.type === 'CREDIT';
            return (
              <View style={styles.tx}>
                <View style={styles.txMain}>
                  <Text style={styles.txComment} numberOfLines={2}>
                    {item.comment || (credit ? 'Пополнение' : 'Списание')}
                  </Text>
                  <Text style={styles.txDate}>{formatDate(item.createdAt)}</Text>
                </View>
                <Text style={[styles.txAmount, credit ? styles.plus : styles.minus]}>
                  {credit ? '+' : '−'}
                  {formatMoney(Math.abs(Number(item.amount)))}
                </Text>
              </View>
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
  content: { padding: 16, paddingBottom: 40 },
  error: { color: colors.amber, fontSize: 13, marginBottom: 12 },
  hero: { backgroundColor: colors.dark, borderRadius: radius.lg, padding: 18, gap: 6 },
  heroLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  heroAmount: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  heroNote: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 24, marginBottom: 8 },
  empty: { fontSize: 13, color: colors.muted },
  tx: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  txMain: { flex: 1, gap: 2 },
  txComment: { fontSize: 14, color: colors.text },
  txDate: { fontSize: 12, color: colors.muted },
  txAmount: { fontSize: 15, fontWeight: '800' },
  plus: { color: colors.green },
  minus: { color: colors.text },
});
