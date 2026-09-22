import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import { catalogApi, type Company, type Product } from '../api/catalog';
import { ProductCard } from '../components/catalog';
import { ScreenHeader } from '../components/requests';
import { colors, radius } from '../theme';

const GAP = 12;

export function SupplierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([catalogApi.company(id), catalogApi.companyProducts(id)])
      .then(([c, page]) => {
        setCompany(c);
        setProducts(page.items);
      })
      .catch(() => setError('Не удалось загрузить поставщика.'));
  }, [id]);

  const cardWidth = (width - 32 - GAP) / 2;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={company?.name ?? 'Поставщик'} />
      {!company && !error ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            error ? (
              <Text style={styles.error}>{error}</Text>
            ) : company ? (
              <View style={styles.head}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{company.name}</Text>
                  {company.verified ? <BadgeCheck size={18} color={colors.green} /> : null}
                </View>
                <Text style={styles.meta}>
                  {[company.city, company.rating ? `★ ${Number(company.rating).toFixed(1)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {company.categories.length ? (
                  <View style={styles.tags}>
                    {company.categories.map((c) => (
                      <Text key={c} style={styles.tag}>
                        {c}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {company.description ? <Text style={styles.description}>{company.description}</Text> : null}
                <Text style={styles.section}>Товары ({products.length})</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={company ? <Text style={styles.meta}>Каталог пока пуст.</Text> : null}
          renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  content: { padding: 16, paddingBottom: 40, gap: GAP },
  column: { gap: GAP },
  error: { color: colors.amber, fontSize: 13 },
  head: { gap: 8, marginBottom: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5, flexShrink: 1 },
  meta: { fontSize: 13, color: colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    fontSize: 12,
    color: '#555',
    backgroundColor: colors.soft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  description: { fontSize: 14, lineHeight: 20, color: '#404040' },
  section: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 10 },
});
