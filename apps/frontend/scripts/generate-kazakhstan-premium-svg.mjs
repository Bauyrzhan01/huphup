/**
 * Generates public/maps/kazakhstan-premium.svg from region path data.
 * Run: node scripts/generate-kazakhstan-premium-svg.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataUrl = pathToFileURL(path.join(root, 'src/landing/live/kazakhstan-map-data.ts')).href;

const { KAZAKHSTAN_MAP } = await import(dataUrl);

const REGION_META = {
  Abai: { slug: 'abai', label: 'Abai Region' },
  Akmola: { slug: 'akmola', label: 'Akmola Region' },
  Aktobe: { slug: 'aktobe', label: 'Aktobe Region' },
  Almaty: { slug: 'almaty-region', label: 'Almaty Region' },
  'Almaty (city)': { slug: 'almaty-city', label: 'Almaty City' },
  Astana: { slug: 'astana', label: 'Astana City' },
  Atyrau: { slug: 'atyrau', label: 'Atyrau Region' },
  'East Kazakhstan': { slug: 'east-kazakhstan', label: 'East Kazakhstan Region' },
  Jambyl: { slug: 'jambyl', label: 'Jambyl Region' },
  Jetisu: { slug: 'jetisu', label: 'Jetisu Region' },
  Karaganda: { slug: 'karaganda', label: 'Karaganda Region' },
  Kostanay: { slug: 'kostanay', label: 'Kostanay Region' },
  Kyzylorda: { slug: 'kyzylorda', label: 'Kyzylorda Region' },
  Mangystau: { slug: 'mangystau', label: 'Mangystau Region' },
  'North Kazakhstan': { slug: 'north-kazakhstan', label: 'North Kazakhstan Region' },
  Pavlodar: { slug: 'pavlodar', label: 'Pavlodar Region' },
  'Shymkent (city)': { slug: 'shymkent', label: 'Shymkent City' },
  Turkestan: { slug: 'turkestan', label: 'Turkestan Region' },
  Ulytau: { slug: 'ulytau', label: 'Ulytau Region' },
  'West Kazakhstan': { slug: 'west-kazakhstan', label: 'West Kazakhstan Region' },
};

const CITY_MARKERS = [
  { id: 'astana', label: 'Astana', x: 600.4, y: 185, tier: 'major' },
  { id: 'almaty', label: 'Almaty', x: 722.9, y: 445, tier: 'major' },
  { id: 'shymkent', label: 'Shymkent', x: 559.2, y: 472.7, tier: 'major' },
];

const FILL_PALETTE = [
  '#0b1f3a',
  '#0c2544',
  '#0d2b4d',
  '#0e3156',
  '#0f375f',
  '#103d68',
  '#114371',
  '#12497a',
];

function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const regionPaths = KAZAKHSTAN_MAP.states
  .map((state, index) => {
    const meta = REGION_META[state.name] ?? {
      slug: state.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label: state.name,
    };
    const fillIndex = index % FILL_PALETTE.length;
    return `    <path
      id="region-${meta.slug}"
      class="kz-region"
      data-region="${escapeAttr(meta.label)}"
      data-code="${state.code}"
      fill="url(#region-fill-${fillIndex})"
      d="${state.path}"
    />
    <path
      class="kz-glass-overlay"
      d="${state.path}"
      fill="url(#glass-sheen)"
    />`;
  })
  .join('\n');

const cityMarkers = CITY_MARKERS.map(
  (city) => `    <g id="city-${city.id}" class="kz-city kz-city--${city.tier}" transform="translate(${city.x}, ${city.y})" data-city="${escapeAttr(city.label)}">
      <circle class="kz-city-halo" r="18" />
      <circle class="kz-city-ring" r="11" />
      <circle class="kz-city-core" r="5.5" />
    </g>`,
).join('\n');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 549" role="img" aria-labelledby="kz-map-title kz-map-desc">
  <title id="kz-map-title">Interactive map of Kazakhstan</title>
  <desc id="kz-map-desc">Premium vector map of Kazakhstan with 17 regions and 3 cities of republican significance. Each region is interactive and tooltip-ready.</desc>

  <defs>
    <linearGradient id="region-fill-0" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f2747" />
      <stop offset="100%" stop-color="#12345d" />
    </linearGradient>
    <linearGradient id="region-fill-1" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0e2f55" />
      <stop offset="100%" stop-color="#14406f" />
    </linearGradient>
    <linearGradient id="region-fill-2" x1="100%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#10385f" />
      <stop offset="100%" stop-color="#174c7f" />
    </linearGradient>
    <linearGradient id="region-fill-3" x1="0%" y1="50%" x2="100%" y2="50%">
      <stop offset="0%" stop-color="#123f68" />
      <stop offset="100%" stop-color="#185688" />
    </linearGradient>
    <linearGradient id="region-fill-4" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="#114674" />
      <stop offset="100%" stop-color="#1a6296" />
    </linearGradient>
    <linearGradient id="region-fill-5" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#15527f" />
      <stop offset="100%" stop-color="#1d6ea3" />
    </linearGradient>
    <linearGradient id="region-fill-6" x1="100%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#175a89" />
      <stop offset="100%" stop-color="#2078ad" />
    </linearGradient>
    <linearGradient id="region-fill-7" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#196391" />
      <stop offset="100%" stop-color="#2384b8" />
    </linearGradient>

    <linearGradient id="region-hover-fill" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1f8fb8" />
      <stop offset="55%" stop-color="#22b8c9" />
      <stop offset="100%" stop-color="#2ed4c5" />
    </linearGradient>

    <linearGradient id="region-active-fill" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1aa3c8" />
      <stop offset="45%" stop-color="#33d3cf" />
      <stop offset="100%" stop-color="#d4af37" stop-opacity="0.95" />
    </linearGradient>

    <filter id="map-shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#04101f" flood-opacity="0.35" />
    </filter>

    <filter id="glow-soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="glow-active" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.13  0 0 0 0 0.83  0 0 0 0 0.77  0 0 0 0.75 0" />
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <filter id="city-glow" x="-120%" y="-120%" width="340%" height="340%">
      <feGaussianBlur stdDeviation="4.5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <linearGradient id="glass-sheen" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16" />
      <stop offset="38%" stop-color="#ffffff" stop-opacity="0.05" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.1" />
    </linearGradient>
  </defs>

  <style>
    .kz-map-shell { filter: url(#map-shadow); }
    .kz-region {
      stroke: rgba(255, 255, 255, 0.42);
      stroke-width: 0.85;
      vector-effect: non-scaling-stroke;
      cursor: pointer;
      transition: fill 0.28s ease, stroke 0.28s ease, filter 0.28s ease, opacity 0.28s ease;
    }
    .kz-glass-overlay {
      pointer-events: none;
      mix-blend-mode: soft-light;
      opacity: 0.72;
    }
    .kz-region:hover {
      fill: url(#region-hover-fill) !important;
      stroke: rgba(255, 255, 255, 0.92);
      filter: url(#glow-soft);
    }
    .kz-region.is-active,
    .kz-region[aria-pressed="true"] {
      fill: url(#region-active-fill) !important;
      stroke: #f0d58a;
      filter: url(#glow-active);
    }
    .kz-city { pointer-events: none; }
    .kz-city-halo {
      fill: rgba(46, 212, 197, 0.14);
      stroke: none;
      animation: kz-city-pulse 3s ease-in-out infinite;
    }
    .kz-city-ring {
      fill: rgba(255, 255, 255, 0.08);
      stroke: rgba(46, 212, 197, 0.75);
      stroke-width: 1.4;
    }
    .kz-city-core {
      fill: #2ed4c5;
      stroke: #f0d58a;
      stroke-width: 1.2;
      filter: url(#city-glow);
    }
    @keyframes kz-city-pulse {
      0%, 100% { opacity: 0.55; transform: scale(1); }
      50% { opacity: 0.95; transform: scale(1.08); }
    }
  </style>

  <g class="kz-map-shell">
    <g id="kz-regions" class="kz-regions">
${regionPaths}
    </g>

    <g id="kz-cities" class="kz-cities">
${cityMarkers}
    </g>
  </g>
</svg>
`;

const outDir = path.join(root, 'public', 'maps');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'kazakhstan-premium.svg');
fs.writeFileSync(outPath, svg, 'utf8');
console.log(`Wrote ${outPath} (${(svg.length / 1024).toFixed(1)} KB)`);
