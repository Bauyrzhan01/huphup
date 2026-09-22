import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import type { RequestStatus } from '../api/leads';
import { useAuth } from '../auth/AuthContext';
import { STATUS } from '../format';
import { colors, radius } from '../theme';

export function StatusBadge({ status }: { status: RequestStatus }) {
  const s = STATUS[status] ?? STATUS.DRAFT;
  return <Badge label={s.label} bg={s.bg} fg={s.fg} />;
}

export function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Tab roots (back={false}) get the profile avatar on the right instead of a back arrow. */
export function ScreenHeader({ title, back = true }: { title: string; back?: boolean }) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerSafe}>
      <View style={styles.header}>
        {back ? (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            hitSlop={10}
            style={styles.side}
            accessibilityLabel="Назад"
          >
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.side} />
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {back ? <View style={styles.side} /> : <ProfileButton />}
      </View>
    </SafeAreaView>
  );
}

function ProfileButton() {
  const { user } = useAuth();
  const initial = (user?.fullName?.trim()[0] ?? user?.email[0] ?? '·').toUpperCase();
  return (
    <Pressable
      onPress={() => router.push('/profile')}
      hitSlop={6}
      style={styles.side}
      accessibilityLabel="Профиль"
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  headerSafe: { backgroundColor: colors.bg },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  side: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: colors.text },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
