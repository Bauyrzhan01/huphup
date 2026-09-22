import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { authErrorText } from '../auth/errors';
import { ErrorBox, Field, PasswordField, PrimaryButton } from '../components/form';
import { colors } from '../theme';
import { AuthLayout } from './AuthLayout';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError('Введите email и пароль');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(authErrorText(err, 'login'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      kicker="01 / ВХОД"
      title="Вход"
      lead="Войдите, чтобы создавать заявки и получать предложения."
    >
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@company.kz"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <PasswordField
        ref={passwordRef}
        label="Пароль"
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <ErrorBox message={error} />
      <PrimaryButton title="Войти" onPress={() => void submit()} busy={busy} />

      <View style={styles.footer}>
        <Text style={styles.muted}>Нет аккаунта?</Text>
        <Link href="/register" replace style={styles.link}>
          Регистрация
        </Link>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 },
  muted: { color: colors.muted, fontSize: 14 },
  link: { color: colors.text, fontSize: 14, fontWeight: '800' },
});
