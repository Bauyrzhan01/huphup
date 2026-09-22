import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../auth/AuthContext';
import { authErrorText } from '../auth/errors';
import { ErrorBox, Field, PasswordField, PrimaryButton } from '../components/form';
import { colors } from '../theme';
import { AuthLayout } from './AuthLayout';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterScreen() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (fullName.trim().length < 2) return setError('Укажите имя или название компании');
    if (!EMAIL.test(email.trim())) return setError('Проверьте email');
    if (password.length < 8) return setError('Пароль — не короче 8 символов');
    setError('');
    setBusy(true);
    try {
      await register({ fullName, email, password });
    } catch (err) {
      setError(authErrorText(err, 'register'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      kicker="02 / РЕГИСТРАЦИЯ"
      title="Регистрация"
      lead="Получайте заявки покупателей и продавайте через сейф-сделку. Аккаунт общий с HupHup."
    >
      <Field
        label="Имя / компания"
        value={fullName}
        onChangeText={setFullName}
        placeholder="Бауыржан или ТОО «KazStroy»"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <Field
        ref={emailRef}
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
        label="Пароль (от 8 символов)"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <ErrorBox message={error} />
      <PrimaryButton title="Создать аккаунт" onPress={() => void submit()} busy={busy} />
      <Text style={styles.hint}>
        Один аккаунт — оба режима: заказчик и поставщик. Переключаться можно в любой момент.
      </Text>

      <View style={styles.footer}>
        <Text style={styles.muted}>Уже есть аккаунт?</Text>
        <Link href="/login" replace style={styles.link}>
          Войти
        </Link>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4 },
  muted: { color: colors.muted, fontSize: 14 },
  link: { color: colors.text, fontSize: 14, fontWeight: '800' },
});
