import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Camera from 'lucide-react-native/icons/camera';
import ImagePlus from 'lucide-react-native/icons/image-plus';
import X from 'lucide-react-native/icons/x';
import { ApiError } from '../api/client';
import { productsApi, type Product, type ProductImage } from '../api/products';
import { useAuth } from '../auth/AuthContext';
import { confirm } from '../components/confirm';
import { ScreenHeader } from '../components/ui';
import { mediaUrl } from '../config';
import { colors, radius } from '../theme';

const UNITS = ['шт', 'кг', 'т', 'м', 'м²', 'м³', 'л', 'упак'];
const MAX_IMAGES = 10;

// Cropping re-encodes to JPEG, so HEIC from iPhones and oversized originals never reach the API (5 MB cap).
const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [4, 3],
  quality: 0.7,
};

type Photo = { key: string; uri: string; saved?: ProductImage; asset?: ImagePicker.ImagePickerAsset };

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/products');
}

function parsePrice(text: string) {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

export function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('шт');
  const [city, setCity] = useState(user?.company?.city ?? '');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew) return;
    // Hidden products are not public, so the owner's list is the source of truth.
    productsApi
      .mine()
      .then((list) => {
        const p = list.find((x) => x.id === id);
        if (!p) {
          setError('Товар не найден.');
          return;
        }
        setProduct(p);
        setName(p.name);
        setPrice(p.priceFrom ?? '');
        setUnit(p.unit ?? '');
        setCity(p.city ?? '');
        setDescription(p.description ?? '');
        setIsActive(p.isActive);
        setPhotos(p.images.map((img) => ({ key: img.id, uri: mediaUrl(img.url) ?? img.url, saved: img })));
      })
      .catch(() => setError('Не удалось загрузить товар.'))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  async function pick(source: 'library' | 'camera') {
    setError('');
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError('Нет доступа к камере. Разрешите его в настройках телефона.');
        return;
      }
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICK_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;

    const photo: Photo = { key: `${Date.now()}`, uri: asset.uri, asset };
    if (!product) {
      // New product: keep it locally and upload right after the product is created.
      setPhotos((prev) => [...prev, photo]);
      return;
    }
    setPhotoBusy(true);
    try {
      const saved = await productsApi.addImage(product.id, asset);
      setPhotos((prev) => [...prev, { key: saved.id, uri: mediaUrl(saved.url) ?? saved.url, saved }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Фото не загрузилось. Попробуйте ещё раз.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto(photo: Photo) {
    if (photo.saved && product) {
      if (!(await confirm('Удалить фото?', '', 'Удалить', true))) return;
      try {
        await productsApi.removeImage(product.id, photo.saved.id);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Не удалось удалить фото.');
        return;
      }
    }
    setPhotos((prev) => prev.filter((p) => p.key !== photo.key));
  }

  async function save() {
    const priceFrom = parsePrice(price);
    if (name.trim().length < 2) {
      setError('Укажите название товара.');
      return;
    }
    if (priceFrom === undefined) {
      setError('Цена — число, например 4500. Оставьте пустым, если «по запросу».');
      return;
    }
    setBusy(true);
    setError('');
    const input = {
      name: name.trim(),
      priceFrom,
      unit: unit.trim() || undefined,
      city: city.trim() || undefined,
      description: description.trim() || undefined,
    };
    try {
      if (product) {
        await productsApi.update(product.id, { ...input, isActive });
      } else {
        const created = await productsApi.create(input);
        const pending = photos.filter((p) => p.asset);
        const failed = (
          await Promise.allSettled(pending.map((p) => productsApi.addImage(created.id, p.asset!)))
        ).filter((r) => r.status === 'rejected').length;
        if (!isActive) await productsApi.update(created.id, { isActive: false });
        if (failed) {
          // The product exists now — reopen it in edit mode so the photos can be retried.
          router.replace(`/products/${created.id}`);
          return;
        }
      }
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось сохранить. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!product) return;
    if (!(await confirm('Удалить товар?', `«${product.name}» исчезнет из каталога вместе с фото.`, 'Удалить', true))) {
      return;
    }
    setBusy(true);
    try {
      await productsApi.remove(product.id);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось удалить.');
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title={isNew ? 'Новый товар' : 'Товар'} />
      {loading ? (
        <ActivityIndicator color={colors.muted} style={styles.loader} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Фото</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
              {photos.map((p) => (
                <View key={p.key}>
                  <Image source={{ uri: p.uri }} style={styles.photo} />
                  <Pressable
                    onPress={() => void removePhoto(p)}
                    hitSlop={8}
                    style={styles.photoRemove}
                    accessibilityLabel="Удалить фото"
                  >
                    <X size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_IMAGES ? (
                <>
                  <PhotoButton
                    label="Галерея"
                    icon={<ImagePlus size={22} color={colors.muted} />}
                    busy={photoBusy}
                    onPress={() => void pick('library')}
                  />
                  {Platform.OS !== 'web' ? (
                    <PhotoButton
                      label="Камера"
                      icon={<Camera size={22} color={colors.muted} />}
                      busy={photoBusy}
                      onPress={() => void pick('camera')}
                    />
                  ) : null}
                </>
              ) : null}
            </ScrollView>

            <Input label="Название" value={name} onChangeText={setName} placeholder="Цемент М400, мешок 50 кг" />
            <Input
              label="Цена от, ₸ (пусто — по запросу)"
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              placeholder="2 450"
            />
            <Text style={styles.label}>Единица</Text>
            <View style={styles.chips}>
              {UNITS.map((u) => (
                <Pressable key={u} onPress={() => setUnit(u)} style={[styles.chip, unit === u && styles.chipActive]}>
                  <Text style={[styles.chipText, unit === u && styles.chipTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>
            <Input label="Город" value={city} onChangeText={setCity} placeholder="Алматы" />
            <Input
              label="Описание"
              value={description}
              onChangeText={setDescription}
              placeholder="Характеристики, наличие, условия доставки"
              multiline
            />

            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchTitle}>Показывать в каталоге</Text>
                <Text style={styles.switchHint}>Скрытый товар не виден покупателям и не участвует в подборе заявок.</Text>
              </View>
              <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: colors.green }} />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable onPress={() => void save()} disabled={busy} style={[styles.primary, busy && styles.dim]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Сохранить</Text>}
            </Pressable>
            {product ? (
              <Pressable onPress={() => void remove()} disabled={busy} style={styles.delete}>
                <Text style={styles.deleteText}>Удалить товар</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function PhotoButton({
  label,
  icon,
  busy,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[styles.photo, styles.photoAdd]}>
      {busy ? <ActivityIndicator color={colors.muted} /> : icon}
      <Text style={styles.photoAddText}>{label}</Text>
    </Pressable>
  );
}

function Input({ label, multiline, ...input }: ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#9a9a9f"
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMulti]}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loader: { marginTop: 40 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  photos: { gap: 10 },
  photo: { width: 96, height: 72, borderRadius: radius.md, backgroundColor: colors.soft },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.composerLine,
    backgroundColor: colors.bg,
  },
  photoAddText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  field: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputMulti: { minHeight: 100 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.soft, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8 },
  chipActive: { backgroundColor: colors.dark },
  chipText: { fontSize: 13, color: '#555', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  switchHint: { fontSize: 12, lineHeight: 16, color: colors.muted },
  error: { color: colors.amber, fontSize: 13, lineHeight: 18 },
  primary: {
    backgroundColor: colors.dark,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.6 },
  delete: { alignItems: 'center', paddingVertical: 12 },
  deleteText: { fontSize: 14, fontWeight: '700', color: '#b42318' },
});
