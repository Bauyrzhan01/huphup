import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  visible: boolean;
  title: string;
  placeholder: string;
  confirmText: string;
  minLength?: number;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
};

/** Cross-platform replacement for a text prompt (Alert.prompt is iOS-only). */
export function ReasonModal({ visible, onCancel, ...rest }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Mounted only while open, so every opening starts with an empty field. */}
      {visible ? <ReasonForm onCancel={onCancel} {...rest} /> : null}
    </Modal>
  );
}

function ReasonForm({
  title,
  placeholder,
  confirmText,
  minLength = 0,
  onCancel,
  onSubmit,
}: Omit<Props, 'visible'>) {
  const [text, setText] = useState('');
  const tooShort = text.trim().length < minLength;

  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#9a9a9f"
          multiline
          autoFocus
          style={styles.input}
          textAlignVertical="top"
        />
        {minLength > 0 ? <Text style={styles.hint}>Не короче {minLength} символов</Text> : null}
        <View style={styles.actions}>
          <Pressable onPress={onCancel} style={styles.ghost}>
            <Text style={styles.ghostText}>Отмена</Text>
          </Pressable>
          <Pressable
            onPress={() => onSubmit(text.trim())}
            disabled={tooShort}
            style={[styles.primary, tooShort && styles.disabled]}
          >
            <Text style={styles.primaryText}>{confirmText}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: radius.lg, padding: 18, gap: 12 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.soft,
    borderRadius: radius.md,
    padding: 12,
    fontSize: 15,
    color: colors.text,
  },
  hint: { fontSize: 12, color: colors.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  ghost: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: radius.pill },
  ghostText: { fontSize: 14, fontWeight: '700', color: colors.text },
  primary: { backgroundColor: colors.dark, paddingHorizontal: 18, paddingVertical: 11, borderRadius: radius.pill },
  primaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.4 },
});
