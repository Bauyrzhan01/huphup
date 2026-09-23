import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '../api/client';
import { companyApi } from '../api/company';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Field, PrimaryButton } from '../components/form';
import { colors, radius } from '../theme';
import { AuthLayout } from './AuthLayout';

/** A HupHup account without a company: create one before the supplier cabinet opens. */
export function OnboardingScreen() {
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState('');
  const [bin, setBin] = useState('');
  const [city, setCity] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [meta, setMeta] = useState<{ cities: string[]; categories: string[] }>({
    cities: [],
    categories: [],
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    companyApi
      .meta()
      .then((m) => setMeta({ cities: m.cities ?? [], categories: m.categories ?? [] }))
      .catch(() => undefined);
  }, []);

  function toggle(category: string) {
    setPicked((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }

  async function submit() {
    if (name.trim().length < 2) {
      setError('Укажите название компании.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await companyApi.create({
        name: name.trim(),
        bin: bin.trim() || undefined,
        city: city.trim() || undefined,
        categories: picked.length ? picked : undefined,
      });
      await refresh();
    } catch (err) {
      // 409: the account already belongs to a company (e.g. joined by invite) — just move on.
      if (err instanceof ApiError && err.status === 409) {
        await refresh().catch(() => undefined);
      } else {
        setError(err instanceof ApiError ? err.message : 'Не удалось создать компанию. Попробуйте ещё раз.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      kicker="КОМПАНИЯ"
      title="Расскажите о компании"
      lead="По категориям и городу HupHup подбирает вам заявки покупателей."
    >
      <Field label="Название компании" value={name} onChangeText={setName} placeholder="ТОО «Алатау Снаб»" />
      <Field
        label="БИН (необязательно)"
        value={bin}
        onChangeText={setBin}
        keyboardType="number-pad"
        maxLength={12}
        placeholder="12 цифр"
      />
      <Field label="Город" value={city} onChangeText={setCity} placeholder="Алматы" />
      {meta.cities.length ? (
        <View style={styles.chips}>
          {meta.cities.slice(0, 8).map((c) => (
            <Chip key={c} label={c} active={city === c} onPress={() => setCity(c)} />
          ))}
        </View>
      ) : null}

      {meta.categories.length ? (
        <>
          <Text style={styles.label}>Что вы поставляете</Text>
          <View style={styles.chips}>
            {meta.categories.map((c) => (
              <Chip key={c} label={c} active={picked.includes(c)} onPress={() => toggle(c)} />
            ))}
          </View>
        </>
      ) : null}

      <ErrorBox message={error} />
      <PrimaryButton title="Создать компанию" onPress={() => void submit()} busy={busy} />
      <Pressable onPress={() => void logout()} style={styles.logout}>
        <Text style={styles.logoutText}>Выйти из {user?.email}</Text>
      </Pressable>
    </AuthLayout>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.soft, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8 },
  chipActive: { backgroundColor: colors.dark },
  chipText: { fontSize: 13, color: '#555', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  logout: { alignItems: 'center', paddingVertical: 8 },
  logoutText: { fontSize: 13, color: colors.muted, fontWeight: '600' },
});
