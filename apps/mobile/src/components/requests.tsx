import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import type { RequestItem, RequestStatus } from '../api/requests';
import { STATUS, offersLabel } from '../requests/format';
import { colors, radius } from '../theme';

export function StatusBadge({ status }: { status: RequestStatus }) {
  const s = STATUS[status] ?? STATUS.DRAFT;
  return (
    <View style={[styles.status, { backgroundColor: s.bg }]}>
      <Text style={[styles.statusText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export function RequestRow({ request, last }: { request: RequestItem; last?: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(`/requests/${request.id}`)}
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Text style={styles.code}>{request.code}</Text>
          <StatusBadge status={request.status} />
        </View>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {request.title}
        </Text>
        <Text style={styles.rowMeta}>
          {request.city || 'Город не указан'} · {offersLabel(request._count?.offers ?? 0)}
        </Text>
      </View>
      <ChevronRight size={18} color="#b0b0b5" />
    </Pressable>
  );
}

export function ScreenHeader({ title }: { title: string }) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.headerSafe}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={10}
          style={styles.back}
          accessibilityLabel="Назад"
        >
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.back} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  status: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
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
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: colors.soft },
  rowMain: { flex: 1, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  code: { fontSize: 12, fontWeight: '800', color: colors.text },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 12, color: colors.muted },
  headerSafe: { backgroundColor: colors.bg },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: colors.text },
});
