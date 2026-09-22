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
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import { ApiError } from '../api/client';
import { dealsApi, type Deal, type DealStatus } from '../api/deals';
import { ScreenHeader } from '../components/requests';
import { ReasonModal } from '../components/ReasonModal';
import { confirm } from '../components/confirm';
import { formatDate, formatMoney } from '../requests/format';
import { colors, radius } from '../theme';

const STATUS: Record<DealStatus, { label: string; bg: string; fg: string }> = {
  AWAITING_PAYMENT: { label: 'Ждём оплату', bg: colors.amberSoft, fg: colors.amber },
  HELD: { label: 'Деньги у площадки', bg: '#eef4ff', fg: '#2563eb' },
  SHIPPED: { label: 'Отгружено', bg: '#eef4ff', fg: '#2563eb' },
  RELEASED: { label: 'Деньги выплачены', bg: colors.greenSoft, fg: colors.green },
  REFUNDED: { label: 'Деньги возвращены', bg: colors.soft, fg: colors.muted },
  DISPUTED: { label: 'Спор', bg: '#fdecec', fg: '#b42318' },
};

function hint(deal: Deal) {
  switch (deal.status) {
    case 'AWAITING_PAYMENT':
      return 'Оплатите сделку — деньги перейдут на удержание, и поставщик сможет отгружать.';
    case 'HELD':
      return 'Деньги на удержании у HupHup. Поставщик готовит отгрузку.';
    case 'SHIPPED':
      return `Подтвердите получение. Иначе деньги уйдут поставщику${
        deal.autoReleaseAt ? ` ${formatDate(deal.autoReleaseAt)}` : ' автоматически'
      }.`;
    case 'RELEASED':
      return 'Сделка закрыта, деньги на балансе поставщика.';
    case 'REFUNDED':
      return 'Сделка отменена, деньги вернулись на ваш баланс.';
    case 'DISPUTED':
      return 'Спор открыт, автовыпуск остановлен. Решение принимает площадка.';
  }
}

type Prompt = { kind: 'cancel' | 'dispute'; deal: Deal } | null;

export function DealsScreen() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [error, setError] = useState('');
  const [lowBalance, setLowBalance] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>(null);

  const load = useCallback(async () => {
    try {
      const list = await dealsApi.list();
      // The API returns both sides; this screen is the buyer's.
      setDeals(list.filter((d) => d.side === 'buyer'));
      setError('');
    } catch {
      setError('Не удалось загрузить сделки. Потяните вниз, чтобы обновить.');
      setDeals((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function run(deal: Deal, action: () => Promise<Deal>) {
    setBusyId(deal.id);
    setError('');
    setLowBalance(false);
    try {
      const updated = await action();
      setDeals((prev) => prev?.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)) ?? prev);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setLowBalance(true);
        setError('На балансе не хватает денег для оплаты.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Не получилось. Попробуйте ещё раз.');
      }
    } finally {
      setBusyId('');
    }
  }

  async function pay(deal: Deal) {
    const ok = await confirm(
      'Оплатить сделку?',
      `${formatMoney(deal.amount, deal.currency)} спишется с вашего баланса и будет лежать у HupHup, пока вы не подтвердите получение.`,
      'Оплатить',
    );
    if (ok) await run(deal, () => dealsApi.pay(deal.id));
  }

  async function confirmReceived(deal: Deal) {
    const ok = await confirm(
      'Подтвердить получение?',
      'Деньги уйдут поставщику. Отменить это будет нельзя.',
      'Подтвердить',
    );
    if (ok) await run(deal, () => dealsApi.confirm(deal.id));
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Сделки" back={false} />
      {deals === null ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <FlatList
          data={deals}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListHeaderComponent={
            <>
              <View style={styles.intro}>
                <ShieldCheck size={20} color={colors.green} />
                <Text style={styles.introText}>
                  Сейф-сделка: деньги лежат у HupHup и уходят поставщику только после того, как вы
                  подтвердите получение.
                </Text>
              </View>
              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                  {lowBalance ? (
                    <Pressable onPress={() => router.push('/balance')}>
                      <Text style={styles.errorLink}>Перейти к балансу →</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              Сделок пока нет. Сделка появится, когда вы примете предложение поставщика в заявке.
            </Text>
          }
          renderItem={({ item: deal }) => {
            const s = STATUS[deal.status];
            const busy = busyId === deal.id;
            return (
              <View style={styles.card}>
                <Pressable onPress={() => router.push(`/requests/${deal.request.id}`)}>
                  <View style={styles.cardTop}>
                    <Text style={styles.code}>{deal.request.code}</Text>
                    <View style={[styles.status, { backgroundColor: s.bg }]}>
                      <Text style={[styles.statusText, { color: s.fg }]}>{s.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.title} numberOfLines={2}>
                    {deal.request.title}
                  </Text>
                  <Text style={styles.party}>
                    {deal.company.name}
                    {deal.request.city ? ` · ${deal.request.city}` : ''}
                  </Text>
                </Pressable>
                <Text style={styles.amount}>{formatMoney(deal.amount, deal.currency)}</Text>
                <Text style={styles.hint}>{hint(deal)}</Text>
                {deal.disputeReason ? (
                  <Text style={styles.dispute}>Причина спора: {deal.disputeReason}</Text>
                ) : null}

                <View style={styles.actions}>
                  {deal.status === 'AWAITING_PAYMENT' ? (
                    <Action title="Оплатить" primary busy={busy} onPress={() => void pay(deal)} />
                  ) : null}
                  {deal.status === 'SHIPPED' ? (
                    <Action
                      title="Подтвердить получение"
                      primary
                      busy={busy}
                      onPress={() => void confirmReceived(deal)}
                    />
                  ) : null}
                  {deal.status === 'HELD' ? (
                    <Action
                      title="Отменить"
                      busy={busy}
                      onPress={() => setPrompt({ kind: 'cancel', deal })}
                    />
                  ) : null}
                  {deal.status === 'HELD' || deal.status === 'SHIPPED' ? (
                    <Action
                      title="Открыть спор"
                      busy={busy}
                      onPress={() => setPrompt({ kind: 'dispute', deal })}
                    />
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      <ReasonModal
        visible={prompt?.kind === 'cancel'}
        title="Отменить сделку?"
        placeholder="Причина отмены (необязательно)"
        confirmText="Отменить сделку"
        onCancel={() => setPrompt(null)}
        onSubmit={(reason) => {
          const deal = prompt?.deal;
          setPrompt(null);
          if (deal) void run(deal, () => dealsApi.cancel(deal.id, reason || undefined));
        }}
      />
      <ReasonModal
        visible={prompt?.kind === 'dispute'}
        title="Открыть спор"
        placeholder="Что пошло не так?"
        confirmText="Открыть спор"
        minLength={5}
        onCancel={() => setPrompt(null)}
        onSubmit={(reason) => {
          const deal = prompt?.deal;
          setPrompt(null);
          if (deal) void run(deal, () => dealsApi.dispute(deal.id, reason));
        }}
      />
    </View>
  );
}

function Action({
  title,
  primary,
  busy,
  onPress,
}: {
  title: string;
  primary?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.action, primary ? styles.actionPrimary : styles.actionGhost, busy && styles.dim]}
      accessibilityRole="button"
    >
      {busy && primary ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  intro: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: colors.greenSoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },
  introText: { flex: 1, fontSize: 13, lineHeight: 18, color: '#1f5c4b' },
  errorBox: { backgroundColor: colors.amberSoft, borderRadius: radius.md, padding: 12, marginBottom: 12, gap: 6 },
  errorText: { color: colors.amber, fontSize: 13, lineHeight: 18 },
  errorLink: { color: colors.amber, fontSize: 13, fontWeight: '800' },
  empty: { fontSize: 13, lineHeight: 19, color: '#555', padding: 4 },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { fontSize: 12, fontWeight: '800', color: colors.text },
  status: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 4 },
  party: { fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 4 },
  hint: { fontSize: 13, lineHeight: 18, color: '#555' },
  dispute: { fontSize: 13, lineHeight: 18, color: '#b42318' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  action: {
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.dark },
  actionGhost: { borderWidth: 1, borderColor: colors.line },
  actionText: { fontSize: 13, fontWeight: '700', color: colors.text },
  actionTextPrimary: { color: '#fff' },
  dim: { opacity: 0.6 },
});
