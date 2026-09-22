import { useCallback, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ApiError } from '../api/client';
import { leadsApi, offersApi, type CompanyOffer, type Lead } from '../api/leads';
import { confirm } from '../components/confirm';
import { Badge, ScreenHeader, StatusBadge } from '../components/ui';
import { formatDate, formatMoney } from '../format';
import { colors, radius } from '../theme';
import { OFFER_STATUS } from './OffersScreen';

function parseAmount(text: string) {
  const n = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function LeadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [offer, setOffer] = useState<CompanyOffer | null>(null);
  const [error, setError] = useState('');
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // There is no GET /leads/:id; the list is small and already scoped to our company.
      const [leads, offers] = await Promise.all([leadsApi.list(), offersApi.list()]);
      const found = leads.find((l) => l.id === id || l.requestId === id) ?? null;
      setLead(found);
      setOffer(found ? (offers.find((o) => o.request.id === found.requestId) ?? null) : null);
      setError(found ? '' : 'Заявка не найдена.');
      if (found?.status === 'NEW') void leadsApi.view(found.id).catch(() => undefined);
    } catch {
      setError('Не удалось загрузить заявку.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function send() {
    if (!lead) return;
    const amount = parseAmount(price);
    if (!amount) {
      setError('Укажите цену за всю партию.');
      return;
    }
    const deliveryDays = days.trim() ? Number.parseInt(days, 10) : undefined;
    const ok = await confirm(
      'Отправить предложение?',
      `${formatMoney(amount)}${deliveryDays !== undefined ? `, доставка ${deliveryDays} дн.` : ''}. Покупатель увидит его в своей заявке.`,
      'Отправить',
    );
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await offersApi.create({
        requestId: lead.requestId,
        price: amount,
        deliveryDays: Number.isFinite(deliveryDays) ? deliveryDays : undefined,
        comment: comment.trim() || undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось отправить. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!lead) return;
    if (!(await confirm('Пропустить заявку?', 'Она уйдёт в архив.', 'Пропустить', true))) return;
    setBusy(true);
    try {
      await leadsApi.skip(lead.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!offer) return;
    if (!(await confirm('Отозвать предложение?', 'Покупатель больше не сможет его принять.', 'Отозвать', true))) {
      return;
    }
    setBusy(true);
    try {
      await offersApi.withdraw(offer.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не получилось. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  const r = lead?.request;
  const open = r?.status === 'PUBLISHED';
  const canOffer = Boolean(lead && open && !offer && lead.status !== 'SKIPPED');

  return (
    <View style={styles.screen}>
      <ScreenHeader title={r?.code ?? 'Заявка'} />
      {!lead && !error ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {r ? (
              <>
                <StatusBadge status={r.status} />
                <Text style={styles.title}>{r.title}</Text>
                <Text style={styles.description}>{r.description}</Text>

                <View style={styles.facts}>
                  <Fact label="Количество" value={r.quantity} />
                  <Fact label="Город" value={r.city} />
                  <Fact label="Срок" value={r.deadline ? formatDate(r.deadline) : null} />
                  <Fact label="Категория" value={r.category} />
                </View>

                {lead?.matchedProduct ? (
                  <View style={styles.match}>
                    <Text style={styles.matchLabel}>Подобрано по вашему товару</Text>
                    <Text style={styles.matchName}>{lead.matchedProduct.name}</Text>
                    {lead.matchedProduct.priceFrom ? (
                      <Text style={styles.matchPrice}>
                        от {formatMoney(lead.matchedProduct.priceFrom, lead.matchedProduct.currency)}
                        {lead.matchedProduct.unit ? ` / ${lead.matchedProduct.unit}` : ''}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}

            {offer ? (
              <View style={styles.offer}>
                <View style={styles.offerTop}>
                  <Text style={styles.section}>Ваше предложение</Text>
                  <Badge {...OFFER_STATUS[offer.status]} />
                </View>
                <Text style={styles.offerPrice}>{formatMoney(offer.price, offer.currency)}</Text>
                {offer.deliveryDays !== null ? (
                  <Text style={styles.offerMeta}>Доставка: {offer.deliveryDays} дн.</Text>
                ) : null}
                {offer.comment ? <Text style={styles.offerMeta}>{offer.comment}</Text> : null}
                {offer.status === 'ACCEPTED' ? (
                  <Text style={styles.accepted}>
                    Покупатель принял предложение — сделка появилась во вкладке «Сделки».
                  </Text>
                ) : null}
                {offer.status === 'PENDING' ? (
                  <Pressable onPress={() => void withdraw()} disabled={busy} style={styles.ghost}>
                    <Text style={styles.ghostText}>Отозвать</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {lead && !open && !offer ? (
              <Text style={styles.note}>Покупатель уже не принимает предложения по этой заявке.</Text>
            ) : null}
            {lead?.status === 'SKIPPED' && open ? (
              <Text style={styles.note}>Вы пропустили эту заявку.</Text>
            ) : null}

            {canOffer ? (
              <View style={styles.form}>
                <Text style={styles.section}>Ваше предложение</Text>
                <Input label="Цена за всю партию, ₸" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="450 000" />
                <Input label="Срок доставки, дней" value={days} onChangeText={setDays} keyboardType="number-pad" placeholder="3" />
                <Input
                  label="Комментарий"
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Условия, наличие, доставка"
                  multiline
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable onPress={() => void send()} disabled={busy} style={[styles.primary, busy && styles.dim]}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Отправить предложение</Text>
                  )}
                </Pressable>
                <Pressable onPress={() => void skip()} disabled={busy} style={styles.ghostWide}>
                  <Text style={styles.ghostText}>Пропустить заявку</Text>
                </Pressable>
              </View>
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

function Input({
  label,
  multiline,
  ...input
}: ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor="#9a9a9f"
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMulti]}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loader: { marginTop: 40 },
  content: { padding: 16, paddingBottom: 48, gap: 10 },
  title: { fontSize: 21, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  description: { fontSize: 15, lineHeight: 22, color: '#404040' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  fact: { backgroundColor: colors.soft, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  factLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  factValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  match: { backgroundColor: colors.greenSoft, borderRadius: radius.md, padding: 12, gap: 2 },
  matchLabel: { fontSize: 11, color: colors.green, fontWeight: '700' },
  matchName: { fontSize: 14, color: colors.text, fontWeight: '700' },
  matchPrice: { fontSize: 12, color: '#1f5c4b' },
  section: { fontSize: 16, fontWeight: '800', color: colors.text },
  offer: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, gap: 6, marginTop: 8 },
  offerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offerPrice: { fontSize: 20, fontWeight: '800', color: colors.text },
  offerMeta: { fontSize: 13, lineHeight: 18, color: '#555' },
  accepted: { fontSize: 13, lineHeight: 18, color: colors.green, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 8 },
  form: { gap: 12, marginTop: 12 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputMulti: { minHeight: 90 },
  error: { color: colors.amber, fontSize: 13, lineHeight: 18 },
  primary: {
    backgroundColor: colors.dark,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.6 },
  ghost: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 4,
  },
  ghostWide: { alignItems: 'center', paddingVertical: 10 },
  ghostText: { fontSize: 13, fontWeight: '700', color: colors.text },
});
