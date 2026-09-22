import { useCallback, useEffect, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router, useFocusEffect } from 'expo-router';
// Per-icon imports: Metro doesn't tree-shake, the barrel pulls in all ~1800 icons.
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import { useAuth } from '../auth/AuthContext';
import { BannerCarousel } from '../components/BannerCarousel';
import { confirm } from '../components/confirm';
import { RequestRow } from '../components/requests';
import { directoryApi, requestsApi, type PublishResult, type RequestItem } from '../api/requests';
import { DEADLINE_CHOICES, formatDate, isoInDays } from '../requests/format';
import { useRequestChat, type ChatTurn } from '../requests/useRequestChat';
import { colors, radius } from '../theme';

const RECENT_COUNT = 3;

type OpenTool = 'city' | 'deadline' | null;

export function HomeScreen() {
  const { user, logout } = useAuth();
  const initial = (user?.fullName?.trim()[0] ?? user?.email[0] ?? '·').toUpperCase();
  const chat = useRequestChat();
  const [text, setText] = useState('');
  const [openTool, setOpenTool] = useState<OpenTool>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [recent, setRecent] = useState<RequestItem[] | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    directoryApi
      .meta()
      .then((m) => setCities(m.cities ?? []))
      .catch(() => setCities([]));
  }, []);

  const loadRecent = useCallback(() => {
    requestsApi
      .list()
      .then((list) => setRecent(list.slice(0, RECENT_COUNT)))
      .catch(() => setRecent((prev) => prev ?? []));
  }, []);

  // Refresh whenever the screen comes back into view (e.g. after opening a request).
  useFocusEffect(loadRecent);

  useEffect(() => {
    if (chat.started) scrollRef.current?.scrollToEnd({ animated: true });
  }, [chat.chat.length, chat.busy, chat.started]);

  async function confirmLogout() {
    if (await confirm('Выход', `Выйти из аккаунта ${user?.email ?? ''}?`, 'Выйти', true)) {
      void logout();
    }
  }

  async function send(value = text) {
    if (!value.trim() || chat.busy) return;
    setText('');
    setOpenTool(null);
    await chat.send(value);
  }

  function startOver() {
    chat.reset();
    setText('');
    loadRecent();
  }

  const canSend = text.trim().length > 0 && !chat.busy;
  const showPublish = chat.ready && !text.trim();
  const lastTurn = chat.chat[chat.chat.length - 1];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>H</Text>
          </View>
          <Text style={styles.brandText}>HupHup</Text>
        </View>
        <Pressable
          style={styles.avatar}
          onPress={confirmLogout}
          accessibilityLabel={`${user?.fullName ?? 'Профиль'} — выйти`}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </Pressable>
      </View>

      {chat.published ? (
        <PublishedView result={chat.published} onNew={startOver} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {chat.started ? (
              <View style={styles.thread}>
                {chat.chat.map((turn, i) => (
                  <Bubble
                    key={`${turn.role}-${i}`}
                    turn={turn}
                    showOptions={turn === lastTurn && !chat.busy && !chat.ready}
                    onOption={(opt) => void send(opt)}
                  />
                ))}
                {chat.busy ? (
                  <View style={[styles.bubble, styles.bubbleAi, styles.typing]}>
                    <ActivityIndicator size="small" color={colors.muted} />
                    <Text style={styles.typingText}>AI думает…</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <BannerCarousel city={chat.city || undefined} />
            )}

            {chat.error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{chat.error}</Text>
                <Pressable onPress={() => void chat.retry()} style={styles.retry}>
                  <Text style={styles.retryText}>Повторить</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.composer}>
              {showPublish ? <Text style={styles.readyNote}>Заявка готова — можно публиковать</Text> : null}
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={
                  chat.started ? 'Напишите ответ…' : 'Опишите товар, работу или услугу обычным языком'
                }
                placeholderTextColor="#9a9a9f"
                multiline
                editable={!chat.busy}
                style={[styles.input, chat.started && styles.inputCompact]}
                textAlignVertical="top"
              />

              <View style={styles.composerFooter}>
                <View style={styles.tools}>
                  {chat.started ? (
                    <Pill label="Новая заявка" onPress={startOver} />
                  ) : null}
                  <Pill
                    label={chat.city ? `⌖ ${chat.city}` : '⌖ Город'}
                    active={Boolean(chat.city) || openTool === 'city'}
                    onPress={() => setOpenTool((t) => (t === 'city' ? null : 'city'))}
                  />
                  <Pill
                    label={chat.deadline ? `◷ ${formatDate(chat.deadline)}` : '◷ Срок'}
                    active={Boolean(chat.deadline) || openTool === 'deadline'}
                    onPress={() => setOpenTool((t) => (t === 'deadline' ? null : 'deadline'))}
                  />
                </View>
                {showPublish ? null : (
                  <Pressable
                    onPress={() => void send()}
                    disabled={!canSend}
                    accessibilityLabel="Отправить"
                    style={[styles.send, canSend && styles.sendActive]}
                  >
                    <ArrowUp size={18} color={canSend ? '#fff' : colors.dark} />
                  </Pressable>
                )}
              </View>

              {showPublish ? (
                <Pressable
                  onPress={() => void chat.publish()}
                  disabled={chat.busy}
                  style={[styles.publishWide, styles.publishInComposer, chat.busy && styles.dim]}
                  accessibilityRole="button"
                >
                  {chat.busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.publishText}>Опубликовать заявку</Text>
                  )}
                </Pressable>
              ) : null}

              {openTool === 'city' ? (
                <View style={styles.options}>
                  {cities.length ? (
                    cities.map((c) => (
                      <Pill
                        key={c}
                        label={c}
                        active={chat.city === c}
                        onPress={() => {
                          chat.setCity(chat.city === c ? '' : c);
                          setOpenTool(null);
                        }}
                      />
                    ))
                  ) : (
                    <Text style={styles.muted}>Городов пока нет в каталоге — укажите город в тексте.</Text>
                  )}
                </View>
              ) : null}
              {openTool === 'deadline' ? (
                <View style={styles.options}>
                  {DEADLINE_CHOICES.map((d) => {
                    const iso = isoInDays(d.days);
                    return (
                      <Pill
                        key={d.label}
                        label={d.label}
                        active={chat.deadline === iso}
                        onPress={() => {
                          chat.setDeadline(chat.deadline === iso ? '' : iso);
                          setOpenTool(null);
                        }}
                      />
                    );
                  })}
                </View>
              ) : null}
            </View>

            {chat.started ? null : (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Недавние заявки</Text>
                  <Link href="/requests" style={styles.sectionLink}>
                    Все
                  </Link>
                </View>
                {recent === null ? (
                  <ActivityIndicator color={colors.muted} style={styles.loader} />
                ) : recent.length === 0 ? (
                  <View style={styles.emptyHint}>
                    <Text style={styles.emptyText}>
                      Пока нет заявок. Опишите запрос выше и опубликуйте — поставщики получат
                      уведомление.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.list}>
                    {recent.map((r, i) => (
                      <RequestRow key={r.id} request={r} last={i === recent.length - 1} />
                    ))}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Bubble({
  turn,
  showOptions,
  onOption,
}: {
  turn: ChatTurn;
  showOptions: boolean;
  onOption: (option: string) => void;
}) {
  const mine = turn.role === 'user';
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleAi]}>
        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{turn.text}</Text>
      </View>
      {showOptions && turn.options?.length ? (
        <View style={styles.bubbleOptions}>
          {turn.options.map((opt) => (
            <Pill key={opt} label={opt} onPress={() => onOption(opt)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PublishedView({ result, onNew }: { result: PublishResult; onNew: () => void }) {
  const { request, leadsCreated, matchedSuppliers } = result;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.doneHead}>
        <CircleCheck size={28} color={colors.green} />
        <Text style={styles.doneTitle}>Заявка опубликована</Text>
        <Text style={styles.doneSub}>
          {request.code} · подобрано поставщиков: {leadsCreated}
        </Text>
      </View>
      <Text style={styles.muted}>
        Заявка ушла компаниям, чей каталог лучше всего подходит под запрос. Их предложения появятся в
        заявке.
      </Text>

      {matchedSuppliers.length ? (
        <View style={[styles.list, styles.matched]}>
          {matchedSuppliers.map((m, i) => (
            <View key={m.companyId} style={[styles.matchRow, i === matchedSuppliers.length - 1 && styles.matchRowLast]}>
              <View style={styles.flex}>
                <Text style={styles.matchName}>{m.companyName}</Text>
                {m.reason ? (
                  <Text style={styles.matchReason} numberOfLines={2}>
                    {m.reason}
                  </Text>
                ) : null}
                {m.city ? <Text style={styles.matchCity}>{m.city}</Text> : null}
              </View>
              <Text style={styles.matchScore}>{Math.round(m.score)}%</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.emptyHint, styles.matched]}>
          <Text style={styles.emptyText}>
            Подходящих поставщиков пока не нашлось — заявка видна в каталоге, предложения могут прийти
            позже.
          </Text>
        </View>
      )}

      <View style={styles.doneActions}>
        <Pressable
          style={styles.publishWide}
          onPress={() => router.push(`/requests/${request.id}`)}
          accessibilityRole="button"
        >
          <Text style={styles.publishText}>Открыть заявку</Text>
        </Pressable>
        <Pressable style={styles.ghostWide} onPress={onNew} accessibilityRole="button">
          <Text style={styles.ghostText}>Новая заявка</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Pill({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  dim: { opacity: 0.6 },
  muted: { fontSize: 13, lineHeight: 19, color: colors.muted },
  topbar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  brandText: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  thread: { gap: 10, marginBottom: 14 },
  bubbleRow: { alignItems: 'flex-start', gap: 8 },
  bubbleRowMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: colors.dark, borderBottomRightRadius: 6 },
  bubbleAi: { backgroundColor: colors.soft, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 21, color: colors.text },
  bubbleTextMine: { color: '#fff' },
  bubbleOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  typingText: { fontSize: 14, color: colors.muted },
  errorBox: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  errorText: { color: colors.amber, fontSize: 13, lineHeight: 18 },
  retry: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryText: { color: colors.amber, fontSize: 12, fontWeight: '700' },
  composer: {
    borderWidth: 1,
    borderColor: colors.composerLine,
    borderRadius: radius.composer,
    backgroundColor: '#fff',
    padding: 14,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  readyNote: { fontSize: 13, fontWeight: '700', color: colors.green, marginBottom: 6, paddingHorizontal: 4 },
  input: {
    minHeight: 86,
    maxHeight: 180,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  inputCompact: { minHeight: 48 },
  composerFooter: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tools: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: {
    backgroundColor: colors.soft,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  pillActive: { backgroundColor: colors.dark },
  pillText: { fontSize: 12, color: '#555', fontWeight: '500' },
  pillTextActive: { color: '#fff' },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.35,
  },
  sendActive: { backgroundColor: colors.dark, opacity: 1 },
  publishInComposer: { marginTop: 12, paddingVertical: 13 },
  publishText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  sectionHead: {
    marginTop: 30,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionLink: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  loader: { marginTop: 12 },
  list: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' },
  emptyHint: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fafafa',
    borderRadius: radius.md,
    padding: 14,
  },
  emptyText: { fontSize: 13, lineHeight: 19, color: '#555' },
  doneHead: { alignItems: 'flex-start', gap: 6, marginBottom: 10, marginTop: 8 },
  doneTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.8, color: colors.text },
  doneSub: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  matched: { marginTop: 16 },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  matchRowLast: { borderBottomWidth: 0 },
  matchName: { fontSize: 15, fontWeight: '700', color: colors.text },
  matchReason: { fontSize: 13, color: '#555', marginTop: 2, lineHeight: 18 },
  matchCity: { fontSize: 12, color: colors.muted, marginTop: 2 },
  matchScore: { fontSize: 15, fontWeight: '800', color: colors.green },
  doneActions: { marginTop: 20, gap: 10 },
  publishWide: {
    backgroundColor: colors.dark,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ghostWide: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostText: { color: colors.text, fontSize: 14, fontWeight: '700' },
});
