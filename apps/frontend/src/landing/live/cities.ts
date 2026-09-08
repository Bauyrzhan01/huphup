import type { MapCity } from './types';

export const MAP_VIEWBOX = { width: 1000, height: 549 };

/** HupHup hub — geographic center (Karaganda region). */
export const MAP_CENTER = { x: 655, y: 281 };

export const MAP_CITIES: MapCity[] = [
  { id: 'astana', label: 'Астана', x: 600, y: 185, aliases: ['астана', 'astana', 'nur-sultan', 'нур-сultan', 'нұр-сultan'] },
  { id: 'almaty', label: 'Алматы', x: 723, y: 445, aliases: ['алматы', 'almaty'] },
  { id: 'shymkent', label: 'Шымкент', x: 559, y: 473, aliases: ['шымкент', 'shymkent'] },
  { id: 'karaganda', label: 'Караганда', x: 655, y: 281, aliases: ['караганда', 'karaganda'] },
  { id: 'aktau', label: 'Актау', x: 213, y: 418, aliases: ['актау', 'aktau', 'мангystau', 'маңыстау'] },
  { id: 'atyrau', label: 'Атырау', x: 207, y: 306, aliases: ['атырау', 'atyrau'] },
  { id: 'pavlodar', label: 'Павлодар', x: 703, y: 146, aliases: ['павлодар', 'pavlodar'] },
  { id: 'ust', label: 'Усть-Каменогорск', x: 889, y: 258, aliases: ['усть-каменогорск', 'oskemen', 'öskemen', 'öskemen'] },
];

export const MAP_FEATURE_CITIES = ['astana', 'almaty', 'shymkent'] as const;

export function matchMapCity(name: string | null | undefined): MapCity | null {
  if (!name?.trim()) return null;
  const key = name.trim().toLowerCase();
  return MAP_CITIES.find((city) => city.aliases.some((alias) => key.includes(alias) || alias.includes(key))) ?? null;
}

export function resolveCityCounts(
  cities: Array<{ name: string; count: number }>,
): Array<MapCity & { count: number }> {
  const merged = new Map<string, { city: MapCity; count: number }>();

  for (const row of cities) {
    const mapped = matchMapCity(row.name);
    if (!mapped) continue;
    const prev = merged.get(mapped.id);
    merged.set(mapped.id, {
      city: mapped,
      count: (prev?.count ?? 0) + row.count,
    });
  }

  return [...merged.values()]
    .map(({ city, count }) => ({ ...city, count }))
    .sort((a, b) => b.count - a.count);
}

export function resolveCityPoint(name: string | null | undefined): { x: number; y: number } | null {
  const city = matchMapCity(name);
  return city ? { x: city.x, y: city.y } : null;
}

export function resolveCityPoints(names: string[]): Array<MapCity & { x: number; y: number }> {
  const merged = new Map<string, MapCity>();
  for (const name of names) {
    const city = matchMapCity(name);
    if (city) merged.set(city.id, city);
  }
  if (merged.size === 0) {
    return MAP_FEATURE_CITIES.map((id) => MAP_CITIES.find((city) => city.id === id)!);
  }
  return [...merged.values()];
}
