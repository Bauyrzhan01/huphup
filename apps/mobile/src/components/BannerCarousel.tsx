import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { fetchBanners, type Banner } from '../api/banners';
import { WEB_URL, mediaUrl } from '../config';
import { colors } from '../theme';

// Same proportions as the admin preview, so a creative is cropped the same way in both.
const ASPECT = 1029 / 450;
// Matches the home screen's horizontal padding; onLayout refines it when it fires.
const SIDE_PADDING = 16;
const AUTOPLAY_MS = 5000;

function openCta(url: string | null) {
  if (!url) return;
  // The app has no screens for these yet, so app paths open on the website.
  const target = url.startsWith('/') ? `${WEB_URL}${url}` : url;
  void Linking.openURL(target).catch(() => undefined);
}

export function BannerCarousel({ city }: { city?: string }) {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const width = measured || window.width - SIDE_PADDING * 2;
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dragging = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchBanners({ audience: 'BUYER', city })
      .then((list) => alive && setBanners(list))
      .catch(() => alive && setBanners([]));
    return () => {
      alive = false;
    };
  }, [city]);

  const count = banners?.length ?? 0;

  useEffect(() => {
    if (count < 2 || !width) return;
    const timer = setInterval(() => {
      if (dragging.current) return;
      setIndex((i) => {
        const next = (i + 1) % count;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [count, width]);

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    dragging.current = false;
    if (width) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  if (banners === null) {
    return <View style={[styles.card, styles.skeleton]} />;
  }
  if (!count) return null;

  return (
    <View style={styles.wrap} onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (dragging.current = true)}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.scroller}
      >
        {banners.map((b) => (
          <BannerCard key={b.id} banner={b} width={width} />
        ))}
      </ScrollView>
      {count > 1 ? (
        <View style={styles.dots}>
          {banners.map((b, i) => (
            <View key={b.id} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function BannerCard({ banner, width }: { banner: Banner; width: number }) {
  const image = mediaUrl(banner.imageUrl);

  return (
    <Pressable
      onPress={() => openCta(banner.ctaUrl)}
      disabled={!banner.ctaUrl}
      accessibilityRole={banner.ctaUrl ? 'link' : 'image'}
      accessibilityLabel={banner.title ?? 'Рекламный баннер'}
      style={{ width }}
    >
      {image ? (
        // The creative carries its own text, so the picture is shown as is.
        <Image source={{ uri: image }} style={[styles.card, styles.image]} resizeMode="cover" />
      ) : (
        <View style={[styles.card, styles.body, { backgroundColor: banner.bgColor }]}>
          <Text style={styles.title} numberOfLines={2}>
            {banner.title}
          </Text>
          {banner.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {banner.subtitle}
            </Text>
          ) : null}
          {banner.ctaText ? (
            <View style={styles.cta}>
              <Text style={styles.ctaText}>{banner.ctaText}</Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  scroller: { borderRadius: 18 },
  card: { width: '100%', aspectRatio: ASPECT, borderRadius: 18, overflow: 'hidden' },
  skeleton: { backgroundColor: colors.soft, marginBottom: 14 },
  image: { backgroundColor: colors.soft },
  body: { flex: 1, justifyContent: 'flex-end', padding: 16, gap: 4 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 22 },
  subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18 },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  ctaText: { color: colors.dark, fontSize: 12, fontWeight: '700' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#d4d4d8' },
  dotActive: { width: 18, backgroundColor: colors.dark },
});
