import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import Package from 'lucide-react-native/icons/package';
import type { Company, Product } from '../api/catalog';
import { mediaUrl } from '../config';
import { formatMoney } from '../requests/format';
import { colors, radius } from '../theme';

export function priceText(p: Product) {
  if (!p.priceFrom) return 'Цена по запросу';
  return `от ${formatMoney(p.priceFrom, p.currency)}${p.unit ? ` / ${p.unit}` : ''}`;
}

export function ProductCard({ product, width = 160 }: { product: Product; width?: number }) {
  const cover = mediaUrl(product.images[0]?.url ?? null);
  return (
    <Pressable
      onPress={() => router.push(`/products/${product.id}`)}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      {cover ? (
        <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Package size={28} color="#b0b0b5" />
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.price} numberOfLines={1}>
          {priceText(product)}
        </Text>
        {product.company ? (
          <Text style={styles.meta} numberOfLines={1}>
            {product.company.name}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SupplierCard({ company }: { company: Company }) {
  const logo = mediaUrl(company.avatarUrl);
  return (
    <Pressable
      onPress={() => router.push(`/suppliers/${company.id}`)}
      style={({ pressed }) => [styles.supplier, pressed && styles.pressed]}
    >
      {logo ? (
        <Image source={{ uri: logo }} style={styles.logo} />
      ) : (
        <View style={[styles.logo, styles.logoEmpty]}>
          <Text style={styles.logoText}>{company.name.trim()[0]?.toUpperCase() ?? '·'}</Text>
        </View>
      )}
      <View style={styles.supplierMain}>
        <View style={styles.nameRow}>
          <Text style={styles.supplierName} numberOfLines={1}>
            {company.name}
          </Text>
          {company.verified ? <BadgeCheck size={14} color={colors.green} /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[company.city, company.categories.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {company.rating ? <Text style={styles.rating}>★ {Number(company.rating).toFixed(1)}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#fff' },
  pressed: { opacity: 0.85 },
  cover: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.soft },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: 10, gap: 3 },
  name: { fontSize: 13, fontWeight: '700', color: colors.text, minHeight: 34 },
  price: { fontSize: 13, fontWeight: '800', color: colors.text },
  meta: { fontSize: 11, color: colors.muted },
  supplier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: '#fff',
  },
  logo: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.soft },
  logoEmpty: { backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontWeight: '800' },
  supplierMain: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  supplierName: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  rating: { fontSize: 13, fontWeight: '700', color: colors.text },
});
