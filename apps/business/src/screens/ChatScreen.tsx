import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import Paperclip from 'lucide-react-native/icons/paperclip';
import { chatApi, type Message } from '../api/chat';
import { useAuth } from '../auth/AuthContext';
import { useChat } from '../chat/useChat';
import { ScreenHeader } from '../components/ui';
import { colors, radius } from '../theme';
import { chatTitle } from './ChatsScreen';

function time(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { messages, error, sending, send } = useChat(id);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('Чат');
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    chatApi
      .list()
      .then((list) => {
        const c = list.find((x) => x.id === id);
        if (c) setTitle(chatTitle(c, user?.id));
      })
      .catch(() => undefined);
  }, [id, user?.id]);

  async function submit() {
    if (await send(text)) setText('');
  }

  const canSend = text.trim().length > 0 && !sending;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={title} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        {messages === null ? (
          <ActivityIndicator color={colors.muted} style={styles.loader} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.content}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <Text style={styles.empty}>Сообщений пока нет — напишите первым.</Text>
            }
            renderItem={({ item }) => {
              const mine = item.sender.id === user?.id;
              return (
                <View style={[styles.row, mine && styles.rowMine]}>
                  {!mine ? <Text style={styles.sender}>{item.sender.fullName}</Text> : null}
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                    {item.body ? (
                      <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>
                    ) : null}
                    {item.attachments?.map((a) => (
                      <View key={a.id} style={styles.fileRow}>
                        <Paperclip size={13} color={mine ? '#fff' : colors.text} />
                        <Text style={[styles.file, mine && styles.bodyMine]} numberOfLines={1}>
                          {a.fileName}
                        </Text>
                      </View>
                    ))}
                    <Text style={[styles.time, mine && styles.timeMine]}>{time(item.createdAt)}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <SafeAreaView edges={['bottom']} style={styles.composerSafe}>
          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Сообщение"
              placeholderTextColor="#9a9a9f"
              multiline
              style={styles.input}
            />
            <Pressable
              onPress={() => void submit()}
              disabled={!canSend}
              accessibilityLabel="Отправить"
              style={[styles.send, canSend && styles.sendActive]}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ArrowUp size={18} color={canSend ? '#fff' : colors.dark} />
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loader: { marginTop: 40, flex: 1 },
  content: { padding: 16, gap: 8, flexGrow: 1 },
  empty: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 24 },
  row: { alignItems: 'flex-start', gap: 3 },
  rowMine: { alignItems: 'flex-end' },
  sender: { fontSize: 11, color: colors.muted, marginLeft: 6 },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, gap: 2 },
  bubbleMine: { backgroundColor: colors.dark, borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: colors.soft, borderBottomLeftRadius: 6 },
  body: { fontSize: 15, lineHeight: 21, color: colors.text },
  bodyMine: { color: '#fff' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  file: { fontSize: 13, color: colors.text, flexShrink: 1 },
  time: { fontSize: 10, color: colors.muted, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.6)' },
  error: { color: colors.amber, fontSize: 12, paddingHorizontal: 16, paddingBottom: 6 },
  composerSafe: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: '#fff' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10 },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    backgroundColor: colors.soft,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: colors.text,
  },
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
});
