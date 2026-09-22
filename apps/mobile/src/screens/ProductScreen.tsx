import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Package from 'lucide-react-native/icons/package';
import { catalogApi, type Product } from '../api/catalog';
import { priceText } from '../components/catalog';
import { ScreenHeader } from '../components/requests';
import { mediaUrl } from '../config';
import { colors, radius } from '../theme';

export function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    catalogApi
      .product(id)
      .then(setProduct)
      .catch(() => setError('Не удалось загрузить товар.'));
  }, [id]);

  const cover = mediaUrl(product?.images[0]?.url ?? null);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Товар" />
      {!product && !error ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {product ? (
            <>
              {cover ? (
                <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover" />
              ) : (
                <View style={[styles.cover, styles.coverEmpty]}>
                  <Package size={40} color="#b0b0b5" />
                </View>
              )}
              <Text style={styles.name}>{product.name}</Text>
              <Text style={styles.price}>{priceText(product)}</Text>
              {product.description ? <Text style={styles.description}>{product.description}</Text> : null}

              {product.company ? (
                <Pressable
                  style={styles.company}
                  onPress={() => router.push(`/suppliers/${product.company?.id}`)}
                >
                  <Text style={styles.companyLabel}>Поставщик</Text>
                  <Text style={styles.companyName}>{product.company.name}</Text>
                  {product.company.city ? <Text style={styles.companyCity}>{product.company.city}</Text> : null}
                </Pressable>
              ) : null}

              <Pressable
                style={styles.primary}
                onPress={() =>
                  router.navigate({
                    pathname: '/',
                    params: { draft: `Нужен товар: ${product.name}. Количество: ` },
                  })
                }
              >
                <Text style={styles.primaryText}>Создать заявку на этот товар</Text>
              </Pressable>
              <Text style={styles.hint}>
                AI уточнит количество, город и срок, а заявку увидит этот и другие подходящие поставщики.
              </Text>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  error: { color: colors.amber, fontSize: 13 },
  cover: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: colors.soft },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5, marginTop: 6 },
  price: { fontSize: 17, fontWeight: '800', color: colors.text },
  description: { fontSize: 15, lineHeight: 22, color: '#404040' },
  company: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, gap: 2, marginTop: 6 },
  companyLabel: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  companyName: { fontSize: 15, fontWeight: '700', color: colors.text },
  companyCity: { fontSize: 12, color: colors.muted },
  primary: { backgroundColor: colors.dark, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, lineHeight: 17, color: colors.muted, textAlign: 'center' },
});
