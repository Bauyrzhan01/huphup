import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { catalogApi, type Company } from '../api/catalog';
import { SupplierCard } from '../components/catalog';
import { ScreenHeader } from '../components/requests';
import { colors, radius } from '../theme';

export function SuppliersScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState(params.category ?? '');
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([catalogApi.companies(), catalogApi.meta()])
      .then(([page, meta]) => {
        setCompanies(page.items);
        setCategories(meta.categories ?? []);
      })
      .catch(() => {
        setCompanies([]);
        setError('Не удалось загрузить поставщиков.');
      });
  }, []);

  // The API has no category filter, so the (small) directory is filtered here.
  const visible = useMemo(
    () => (companies ?? []).filter((c) => !category || c.categories.includes(category)),
    [companies, category],
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Поставщики" />
      {companies === null ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={
            <>
              {categories.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                >
                  <Chip label="Все" active={!category} onPress={() => setCategory('')} />
                  {categories.map((c) => (
                    <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
                  ))}
                </ScrollView>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
          }
          ListEmptyComponent={
            error ? null : <Text style={styles.empty}>В этой категории поставщиков пока нет.</Text>
          }
          renderItem={({ item }) => <SupplierCard company={item} />}
        />
      )}
    </View>
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
  screen: { flex: 1, backgroundColor: colors.bg },
  loader: { marginTop: 40 },
  chips: { gap: 8, padding: 16 },
  chip: { backgroundColor: colors.soft, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8 },
  chipActive: { backgroundColor: colors.dark },
  chipText: { fontSize: 13, color: '#555', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  error: { color: colors.amber, fontSize: 13, marginHorizontal: 16 },
  empty: { fontSize: 13, color: colors.muted, margin: 16 },
});
