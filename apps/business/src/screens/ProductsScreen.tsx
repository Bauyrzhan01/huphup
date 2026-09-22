import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Package from 'lucide-react-native/icons/package';
import Plus from 'lucide-react-native/icons/plus';
import { productsApi, type Product } from '../api/products';
import { Badge, ScreenHeader } from '../components/ui';
import { mediaUrl } from '../config';
import { priceText } from '../format';
import { colors, radius } from '../theme';

export function ProductsScreen() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setProducts(await productsApi.mine());
      setError('');
    } catch {
      setProducts((prev) => prev ?? []);
      setError('Не удалось загрузить товары. Потяните вниз, чтобы обновить.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Мои товары" back={false} />
      {products === null ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          ListHeaderComponent={
            <>
              <Pressable onPress={() => router.push('/products/new')} style={styles.add}>
                <Plus size={18} color="#fff" />
                <Text style={styles.addText}>Добавить товар</Text>
              </Pressable>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          }
          ListEmptyComponent={
            error ? null : (
              <Text style={styles.empty}>
                Товаров пока нет. По товарам HupHup подбирает вам заявки покупателей и показывает
                компанию в каталоге.
              </Text>
            )
          }
          renderItem={({ item }) => {
            const cover = mediaUrl(item.images[0]?.url ?? null);
            return (
              <Pressable
                onPress={() => router.push(`/products/${item.id}`)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed, !item.isActive && styles.hidden]}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Package size={22} color="#b0b0b5" />
                  </View>
                )}
                <View style={styles.main}>
                  <Text style={styles.name} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.price}>{priceText(item)}</Text>
                  {!item.isActive ? <Badge label="Скрыт" bg={colors.soft} fg={colors.muted} /> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  add: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dark,
    borderRadius: radius.pill,
    paddingVertical: 14,
    marginBottom: 6,
  },
  addText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  error: { color: colors.amber, fontSize: 13, marginBottom: 8 },
  empty: { fontSize: 13, lineHeight: 19, color: '#555', padding: 4 },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 10,
  },
  pressed: { backgroundColor: colors.soft },
  hidden: { opacity: 0.6 },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.soft },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  price: { fontSize: 13, fontWeight: '700', color: colors.text },
});
