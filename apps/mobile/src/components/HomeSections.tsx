import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { catalogApi, type Company, type Product } from '../api/catalog';
import { dealsApi } from '../api/deals';
import type { RequestItem } from '../api/requests';
import { colors, radius } from '../theme';
import { ProductCard, SupplierCard } from './catalog';

type Attention = { key: string; text: string; href: '/deals' | '/requests' | `/requests/${string}` };

/** Things waiting for the buyer: unpaid deals, shipments to confirm, fresh offers. */
export function AttentionCard({ requests }: { requests: RequestItem[] | null }) {
  const [deals, setDeals] = useState({ toPay: 0, toConfirm: 0 });

  useFocusEffect(
    useCallback(() => {
      dealsApi
        .list()
        .then((list) => {
          const mine = list.filter((d) => d.side === 'buyer');
          setDeals({
            toPay: mine.filter((d) => d.status === 'AWAITING_PAYMENT').length,
            toConfirm: mine.filter((d) => d.status === 'SHIPPED').length,
          });
        })
        .catch(() => undefined);
    }, []),
  );

  const withOffers = (requests ?? []).filter(
    (r) => r.status === 'PUBLISHED' && (r._count?.offers ?? 0) > 0,
  );
  const items: Attention[] = [];
  if (deals.toPay) items.push({ key: 'pay', text: `Оплатите сделку (${deals.toPay})`, href: '/deals' });
  if (deals.toConfirm) {
    items.push({ key: 'confirm', text: `Подтвердите получение (${deals.toConfirm})`, href: '/deals' });
  }
  if (withOffers.length === 1) {
    const r = withOffers[0];
    items.push({ key: 'offers', text: `Новые предложения: ${r.code}`, href: `/requests/${r.id}` });
  } else if (withOffers.length > 1) {
    items.push({ key: 'offers', text: `Есть предложения в ${withOffers.length} заявках`, href: '/requests' });
  }
  if (!items.length) return null;

  return (
    <View style={styles.attention}>
      <Text style={styles.attentionTitle}>Требует внимания</Text>
      {items.map((it) => (
        <Pressable key={it.key} onPress={() => router.push(it.href)} style={styles.attentionRow}>
          <View style={styles.dot} />
          <Text style={styles.attentionText}>{it.text}</Text>
          <ChevronRight size={16} color={colors.amber} />
        </Pressable>
      ))}
    </View>
  );
}

/** Categories, fresh products and top suppliers — only the parts that have data are shown. */
export function DiscoverSections() {
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Company[]>([]);

  useFocusEffect(
    useCallback(() => {
      catalogApi
        .meta()
        .then((m) => setCategories(m.categories ?? []))
        .catch(() => undefined);
      catalogApi
        .products({ limit: 10 })
        .then((p) => setProducts(p.items))
        .catch(() => undefined);
      catalogApi
        .companies(5)
        .then((p) => setSuppliers(p.items))
        .catch(() => undefined);
    }, []),
  );

  return (
    <>
      {categories.length ? (
        <>
          <SectionHead title="Категории" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.hScroll}
            contentContainerStyle={styles.hRow}
          >
            {categories.map((c) => (
              <Pressable
                key={c}
                onPress={() => router.push({ pathname: '/suppliers', params: { category: c } })}
                style={styles.category}
              >
                <Text style={styles.categoryText}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {products.length ? (
        <>
          <SectionHead title="Товары поставщиков" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.hScroll}
            contentContainerStyle={styles.hRow}
          >
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {suppliers.length ? (
        <>
          <SectionHead title="Поставщики" href="/suppliers" />
          <View style={styles.list}>
            {suppliers.map((c) => (
              <SupplierCard key={c.id} company={c} />
            ))}
          </View>
        </>
      ) : null}
    </>
  );
}

function SectionHead({ title, href }: { title: string; href?: '/suppliers' }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {href ? (
        <Link href={href} style={styles.sectionLink}>
          Все
        </Link>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  attention: {
    marginTop: 16,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.lg,
    padding: 14,
    gap: 6,
  },
  attentionTitle: { fontSize: 13, fontWeight: '800', color: colors.amber, marginBottom: 2 },
  attentionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber },
  attentionText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#7a3c07' },
  sectionHead: {
    marginTop: 28,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionLink: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  // Bleeds to the screen edges so cards scroll under the side padding.
  hScroll: { marginHorizontal: -16 },
  hRow: { gap: 10, paddingHorizontal: 16 },
  category: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  categoryText: { fontSize: 13, fontWeight: '600', color: colors.text },
  list: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden' },
});
