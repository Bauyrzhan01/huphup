import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

export function AuthLayout({
  kicker,
  title,
  lead,
  children,
}: {
  kicker: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>H</Text>
            </View>
            <Text style={styles.brandText}>
              HupHup <Text style={styles.brandTag}>Business</Text>
            </Text>
          </View>

          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.lead}>{lead}</Text>

          <View style={styles.form}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 32 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 48 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  brandTag: { color: colors.green },
  brandText: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: colors.muted, marginBottom: 10 },
  title: { fontSize: 36, fontWeight: '800', letterSpacing: -1.2, color: colors.text },
  lead: { marginTop: 8, fontSize: 15, lineHeight: 21, color: colors.muted },
  form: { marginTop: 28, gap: 16 },
});
