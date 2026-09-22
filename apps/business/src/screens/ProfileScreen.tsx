import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import { companyApi, type Company } from '../api/company';
import { useAuth } from '../auth/AuthContext';
import { confirm } from '../components/confirm';
import { ScreenHeader } from '../components/ui';
import { WEB_URL } from '../config';
import { colors, radius } from '../theme';

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    companyApi
      .me()
      .then(setCompany)
      .catch(() => undefined);
  }, []);

  async function confirmLogout() {
    if (await confirm('Выход', `Выйти из аккаунта ${user?.email ?? ''}?`, 'Выйти', true)) {
      void logout();
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Профиль" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>КОМПАНИЯ</Text>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{company?.name ?? user?.company?.name ?? '—'}</Text>
            {company?.verified ? <BadgeCheck size={18} color={colors.green} /> : null}
          </View>
          {company?.city ? <Text style={styles.meta}>{company.city}</Text> : null}
          {company?.bin ? <Text style={styles.meta}>БИН {company.bin}</Text> : null}
          {company?.categories.length ? (
            <View style={styles.tags}>
              {company.categories.map((c) => (
                <Text key={c} style={styles.tag}>
                  {c}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>АККАУНТ</Text>
          <Text style={styles.name}>{user?.fullName}</Text>
          <Text style={styles.meta}>{user?.email}</Text>
        </View>

        <Pressable style={styles.row} onPress={() => void Linking.openURL(WEB_URL)}>
          <Text style={styles.rowText}>Товары, команда и CRM — в веб-кабинете</Text>
          <Text style={styles.rowLink}>Открыть</Text>
        </Pressable>

        <Pressable style={styles.logout} onPress={() => void confirmLogout()}>
          <Text style={styles.logoutText}>Выйти</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16, gap: 4 },
  label: { fontSize: 11, fontWeight: '800', color: colors.muted, letterSpacing: 0.5, marginBottom: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 18, fontWeight: '800', color: colors.text, flexShrink: 1 },
  meta: { fontSize: 13, color: colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: {
    fontSize: 12,
    color: '#555',
    backgroundColor: colors.soft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.soft,
    borderRadius: radius.lg,
    padding: 16,
  },
  rowText: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  rowLink: { fontSize: 13, color: colors.green, fontWeight: '800' },
  logout: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#b42318' },
});
