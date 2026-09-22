import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import { ApiError } from '../api/client';
import { offersApi } from '../api/deals';
import { requestsApi, type Offer, type RequestItem } from '../api/requests';
import { confirm } from '../components/confirm';
import { ScreenHeader, StatusBadge } from '../components/requests';
import { formatDate, formatMoney } from '../requests/format';
import { colors, radius } from '../theme';

const OFFER_STATUS: Record<Offer['status'], string> = {
  PENDING: 'Ожидает решения',
  ACCEPTED: 'Принято',
  REJECTED: 'Отклонено',
  WITHDRAWN: 'Отозвано',
};

export function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [request, setRequest] = useState<RequestItem | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busyOffer, setBusyOffer] = useState('');
  const [notice, setNotice] = useState<'accepted' | 'rejected' | null>(null);
  const [conversationId, setConversationId] = useState('');

  const load = useCallback(async () => {
    try {
      setRequest(await requestsApi.get(id));
      setError('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'Заявка не найдена или удалена.'
          : 'Не удалось загрузить заявку. Потяните вниз, чтобы обновить.',
      );
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function accept(offer: Offer) {
    const ok = await confirm(
      'Принять предложение?',
      `${offer.company.name} · ${formatMoney(offer.price, offer.currency)}. Остальные предложения будут отклонены, откроется сейф-сделка — её нужно будет оплатить.`,
      'Принять',
    );
    if (!ok) return;
    await act(
      offer,
      async () => setConversationId((await offersApi.accept(offer.id)).conversationId),
      'accepted',
    );
  }

  async function reject(offer: Offer) {
    const ok = await confirm('Отклонить предложение?', offer.company.name, 'Отклонить', true);
    if (!ok) return;
    await act(offer, () => offersApi.reject(offer.id), 'rejected');
  }

  async function act(offer: Offer, action: () => Promise<unknown>, result: 'accepted' | 'rejected') {
    setBusyOffer(offer.id);
    setError('');
    setNotice(null);
    try {
      await action();
      setNotice(result);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось. Попробуйте ещё раз.');
    } finally {
      setBusyOffer('');
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const offers = request?.offers ?? [];

  return (
    <View style={styles.screen}>
      <ScreenHeader title={request?.code ?? 'Заявка'} />
      {!request && !error ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice === 'accepted' ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Предложение принято — открыта сейф-сделка. Оплатите её, чтобы поставщик начал отгрузку.
              </Text>
              <Pressable onPress={() => router.push('/deals')} style={styles.noticeButton}>
                <Text style={styles.noticeButtonText}>Перейти к сделке</Text>
              </Pressable>
              {conversationId ? (
                <Pressable onPress={() => router.push(`/chats/${conversationId}`)} style={styles.noticeButton}>
                  <Text style={styles.noticeButtonText}>Написать поставщику</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {notice === 'rejected' ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>Предложение отклонено.</Text>
            </View>
          ) : null}
          {request ? (
            <>
              <StatusBadge status={request.status} />
              <Text style={styles.title}>{request.title}</Text>
              <Text style={styles.description}>{request.description}</Text>

              <View style={styles.facts}>
                <Fact label="Город" value={request.city} />
                <Fact label="Количество" value={request.quantity} />
                <Fact label="Срок" value={request.deadline ? formatDate(request.deadline) : null} />
                <Fact label="Категория" value={request.category} />
                <Fact label="Создана" value={formatDate(request.createdAt)} />
              </View>

              <Text style={styles.section}>Предложения ({offers.length})</Text>
              {offers.length ? (
                <View style={styles.list}>
                  {offers.map((o, i) => (
                    <View key={o.id} style={[styles.offer, i === offers.length - 1 && styles.offerLast]}>
                      <View style={styles.offerTop}>
                        <Text style={styles.company} numberOfLines={1}>
                          {o.company.name}
                        </Text>
                        {o.company.verified ? <BadgeCheck size={15} color={colors.green} /> : null}
                        <Text style={styles.price}>{formatMoney(o.price, o.currency)}</Text>
                      </View>
                      <Text style={styles.offerMeta}>
                        {[
                          o.company.city,
                          o.deliveryDays ? `доставка ${o.deliveryDays} дн.` : null,
                          OFFER_STATUS[o.status],
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      {o.comment ? <Text style={styles.comment}>{o.comment}</Text> : null}
                      {o.status === 'PENDING' && request.status === 'PUBLISHED' ? (
                        <View style={styles.offerActions}>
                          <Pressable
                            onPress={() => void accept(o)}
                            disabled={Boolean(busyOffer)}
                            style={[styles.acceptBtn, busyOffer === o.id && styles.dim]}
                            accessibilityRole="button"
                          >
                            {busyOffer === o.id ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Text style={styles.acceptText}>Принять</Text>
                            )}
                          </Pressable>
                          <Pressable
                            onPress={() => void reject(o)}
                            disabled={Boolean(busyOffer)}
                            style={styles.rejectBtn}
                            accessibilityRole="button"
                          >
                            <Text style={styles.rejectText}>Отклонить</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>
                    Поставщики ещё не прислали предложения. Мы сообщим, как только они появятся.
                  </Text>
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  content: { padding: 16, paddingBottom: 40, alignItems: 'stretch' },
  error: { color: colors.amber, fontSize: 13, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: colors.text, marginTop: 10 },
  description: { fontSize: 15, lineHeight: 22, color: '#404040', marginTop: 8 },
  facts: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
  },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  factLabel: { fontSize: 13, color: colors.muted },
  factValue: { fontSize: 13, fontWeight: '700', color: colors.text, flexShrink: 1, textAlign: 'right' },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 24, marginBottom: 10 },
  list: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' },
  offer: { padding: 14, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  offerLast: { borderBottomWidth: 0 },
  offerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  company: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  price: { marginLeft: 'auto', fontSize: 15, fontWeight: '800', color: colors.text },
  offerMeta: { fontSize: 12, color: colors.muted },
  comment: { fontSize: 13, lineHeight: 18, color: '#404040', marginTop: 2 },
  offerActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  acceptBtn: {
    backgroundColor: colors.dark,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
    minWidth: 96,
    alignItems: 'center',
  },
  acceptText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rejectBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  rejectText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  dim: { opacity: 0.6 },
  notice: { backgroundColor: colors.greenSoft, borderRadius: radius.md, padding: 12, gap: 8, marginBottom: 12 },
  noticeText: { color: '#1f5c4b', fontSize: 13, lineHeight: 18 },
  noticeButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.dark,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  noticeButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fafafa',
    borderRadius: radius.md,
    padding: 14,
  },
  emptyText: { fontSize: 13, lineHeight: 19, color: '#555' },
});
