import { useState } from 'react';
import {
  Alert,
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
// Per-icon imports: Metro doesn't tree-shake, the barrel pulls in all ~1800 icons.
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Bell from 'lucide-react-native/icons/bell';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Paperclip from 'lucide-react-native/icons/paperclip';
import { useAuth } from '../auth/AuthContext';
import { BannerCarousel } from '../components/BannerCarousel';
import { colors, radius } from '../theme';
import {
  CITIES,
  DEADLINES,
  EXAMPLES,
  RECENT_REQUESTS,
  STATUS_LABEL,
  type RecentRequest,
} from '../data/mock';

type OpenTool = 'city' | 'deadline' | null;

export function HomeScreen() {
  const { user, logout } = useAuth();
  const initial = (user?.fullName?.trim()[0] ?? user?.email[0] ?? '·').toUpperCase();

  function confirmLogout() {
    const question = `Выйти из аккаунта ${user?.email ?? ''}?`;
    // react-native-web has no Alert buttons, so the web build asks the browser instead.
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(question)) void logout();
      return;
    }
    Alert.alert('Выход', question, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => void logout() },
    ]);
  }

  const [text, setText] = useState('');
  const [city, setCity] = useState('');
  const [deadline, setDeadline] = useState('');
  const [openTool, setOpenTool] = useState<OpenTool>(null);
  const [recent, setRecent] = useState<RecentRequest[]>(RECENT_REQUESTS);

  const canSend = text.trim().length > 0;

  function toggleTool(tool: Exclude<OpenTool, null>) {
    setOpenTool((cur) => (cur === tool ? null : tool));
  }

  function send() {
    if (!canSend) return;
    const next: RecentRequest = {
      id: String(Date.now()),
      code: `HH-${1043 + recent.length}`,
      title: text.trim(),
      city: city || 'Город не указан',
      status: 'DRAFT',
      offers: 0,
    };
    setRecent((prev) => [next, ...prev]);
    setText('');
    setOpenTool(null);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>H</Text>
          </View>
          <Text style={styles.brandText}>HupHup</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable style={styles.iconBtn} hitSlop={8} accessibilityLabel="Уведомления">
            <Bell size={18} color={colors.text} />
            <View style={styles.badge} />
          </Pressable>
          <Pressable
            style={styles.avatar}
            onPress={confirmLogout}
            accessibilityLabel={`${user?.fullName ?? 'Профиль'} — выйти`}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <BannerCarousel city={city || undefined} />

          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Опишите товар, работу или услугу обычным языком"
              placeholderTextColor="#9a9a9f"
              multiline
              style={styles.input}
              textAlignVertical="top"
            />

            <View style={styles.composerFooter}>
              <View style={styles.tools}>
                <Pill
                  label="Файл"
                  icon={<Paperclip size={13} color={colors.muted} />}
                  onPress={() =>
                    Alert.alert('Файлы', 'Прикрепление фото и документов появится в следующей версии.')
                  }
                />
                <Pill
                  label={city ? `⌖ ${city}` : '⌖ Город'}
                  active={Boolean(city) || openTool === 'city'}
                  onPress={() => toggleTool('city')}
                />
                <Pill
                  label={deadline ? `◷ ${deadline}` : '◷ Срок'}
                  active={Boolean(deadline) || openTool === 'deadline'}
                  onPress={() => toggleTool('deadline')}
                />
              </View>
              <Pressable
                onPress={send}
                disabled={!canSend}
                accessibilityLabel="Отправить"
                style={[styles.send, canSend && styles.sendActive]}
              >
                <ArrowUp size={18} color={canSend ? '#fff' : colors.dark} />
              </Pressable>
            </View>

            {openTool ? (
              <View style={styles.options}>
                {(openTool === 'city' ? CITIES : DEADLINES).map((opt) => {
                  const selected = openTool === 'city' ? city === opt : deadline === opt;
                  return (
                    <Pill
                      key={opt}
                      label={opt}
                      active={selected}
                      onPress={() => {
                        const value = selected ? '' : opt;
                        if (openTool === 'city') setCity(value);
                        else setDeadline(value);
                        setOpenTool(null);
                      }}
                    />
                  );
                })}
              </View>
            ) : null}
          </View>

          {text.trim() ? null : (
            <View style={styles.examples}>
              {EXAMPLES.map((ex) => (
                <Pressable key={ex} style={styles.example} onPress={() => setText(ex)}>
                  <Text style={styles.exampleText}>{ex}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Недавние заявки</Text>
            <Text style={styles.sectionLink}>Все</Text>
          </View>

          {recent.length === 0 ? (
            <View style={styles.emptyHint}>
              <Text style={styles.emptyText}>
                Пока нет заявок. Опишите запрос выше и опубликуйте — поставщики получат уведомление.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {recent.map((r) => (
                <RequestRow key={r.id} request={r} />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Pill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      {icon}
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function RequestRow({ request }: { request: RecentRequest }) {
  const tone =
    request.status === 'IN_PROGRESS'
      ? { bg: colors.greenSoft, fg: colors.green }
      : request.status === 'DRAFT'
        ? { bg: colors.soft, fg: colors.muted }
        : { bg: colors.amberSoft, fg: colors.amber };
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Text style={styles.code}>{request.code}</Text>
          <View style={[styles.status, { backgroundColor: tone.bg }]}>
            <Text style={[styles.statusText, { color: tone.fg }]}>
              {STATUS_LABEL[request.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {request.title}
        </Text>
        <Text style={styles.rowMeta}>
          {request.city} ·{' '}
          {request.offers > 0 ? `предложений: ${request.offers}` : 'ждём предложения'}
        </Text>
      </View>
      <ChevronRight size={18} color="#b0b0b5" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
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
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
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
  input: {
    minHeight: 86,
    maxHeight: 180,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  composerFooter: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tools: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  examples: { marginTop: 14, gap: 8 },
  example: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  exampleText: { fontSize: 14, color: '#404040' },
  sectionHead: {
    marginTop: 30,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionLink: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  list: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: '#fff',
  },
  rowPressed: { backgroundColor: colors.soft },
  rowMain: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { fontSize: 12, fontWeight: '800', color: colors.text },
  status: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.muted },
  emptyHint: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#fafafa',
    borderRadius: radius.md,
    padding: 14,
  },
  emptyText: { fontSize: 13, lineHeight: 19, color: '#555' },
});
