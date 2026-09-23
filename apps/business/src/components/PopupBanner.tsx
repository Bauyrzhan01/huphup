import { useEffect, useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import X from 'lucide-react-native/icons/x';
import { fetchBanners, type Banner } from '../api/banners';
import { WEB_URL, mediaUrl } from '../config';
import { colors, radius } from '../theme';
import { dismissedPopups } from './dismissed';

// Same proportions as the admin preview, so a creative is cropped the same way in both.
const ASPECT = 1029 / 450;

/**
 * An NBO pop-up over the first screen. Admins can aim one at a few accounts
 * first (testEmails), so this shows whatever the API returns for this user.
 */
export function PopupBanner({
  audience,
  city,
}: {
  audience: 'BUYER' | 'SUPPLIER';
  city?: string;
}) {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [list, dismissed] = await Promise.all([
          fetchBanners({ audience, city, placement: 'POPUP' }),
          dismissedPopups.read(),
        ]);
        const next = list.find((b) => !dismissed.includes(b.id));
        if (alive && next) setBanner(next);
      } catch {
        // No pop-up is better than an error on the home screen.
      }
    })();
    return () => {
      alive = false;
    };
  }, [audience, city]);

  function close() {
    if (banner) void dismissedPopups.add(banner.id);
    setBanner(null);
  }

  function open() {
    const url = banner?.ctaUrl;
    close();
    if (!url) return;
    // The app has no screens for these yet, so app paths open on the website.
    void Linking.openURL(url.startsWith('/') ? `${WEB_URL}${url}` : url).catch(() => undefined);
  }

  if (!banner) return null;
  const image = mediaUrl(banner.imageUrl);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropHit} onPress={close} accessibilityLabel="Закрыть" />
        <View style={styles.card}>
          <Pressable
            onPress={open}
            disabled={!banner.ctaUrl}
            accessibilityRole={banner.ctaUrl ? 'button' : undefined}
          >
            {image ? (
              <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={[styles.image, styles.text, { backgroundColor: banner.bgColor }]}>
                <Text style={styles.title}>{banner.title}</Text>
                {banner.subtitle ? <Text style={styles.subtitle}>{banner.subtitle}</Text> : null}
              </View>
            )}
          </Pressable>
          {banner.ctaUrl ? (
            <Pressable onPress={open} style={styles.cta}>
              <Text style={styles.ctaText}>{banner.ctaText || 'Подробнее'}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={close} hitSlop={10} style={styles.close} accessibilityLabel="Закрыть">
            <X size={16} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  backdropHit: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  card: { borderRadius: radius.lg, backgroundColor: colors.bg, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: ASPECT },
  text: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 6 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, textAlign: 'center' },
  cta: { backgroundColor: colors.dark, paddingVertical: 14, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  close: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
