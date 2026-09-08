export function drawLineChart(
  canvas: HTMLCanvasElement,
  series: Array<{ label: string; color: string; values: (number | null)[] }>,
  labels: string[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640;
  const h = canvas.clientHeight || 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { t: 16, r: 16, b: 28, l: 44 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const allValues = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const maxVal = Math.max(100, ...allValues, 1);

  ctx.strokeStyle = '#e6e6e8';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    const val = Math.round(maxVal - (maxVal / 4) * i);
    ctx.fillStyle = '#737373';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(val), pad.l - 6, y + 3);
  }

  const n = Math.max(labels.length, 1);
  series.forEach((s) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    s.values.forEach((v, i) => {
      if (v == null) return;
      const x = pad.l + (plotW * i) / Math.max(n - 1, 1);
      const y = pad.t + plotH - (v / maxVal) * plotH;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    s.values.forEach((v, i) => {
      if (v == null) return;
      const x = pad.l + (plotW * i) / Math.max(n - 1, 1);
      const y = pad.t + plotH - (v / maxVal) * plotH;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.fillStyle = '#737373';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.floor(labels.length / 6));
  labels.forEach((label, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    const x = pad.l + (plotW * i) / Math.max(n - 1, 1);
    ctx.fillText(label, x, h - 8);
  });
}

export function drawStatusTimeline(
  canvas: HTMLCanvasElement,
  rows: boolean[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640;
  const h = canvas.clientHeight || 100;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const slice = rows.slice(0, 48).reverse();
  const barW = Math.max(4, (w - 32) / Math.max(slice.length, 1) - 2);
  const x0 = 16;
  const y0 = 30;
  const barH = 40;

  slice.forEach((ok, i) => {
    const x = x0 + i * (barW + 2);
    ctx.fillStyle = ok ? '#10a37f' : '#ef4444';
    ctx.beginPath();
    ctx.roundRect(x, y0, barW, barH, 3);
    ctx.fill();
  });

  ctx.fillStyle = '#737373';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('← ескі', 16, 88);
  ctx.textAlign = 'right';
  ctx.fillText('жаңа →', w - 16, 88);
}

export function drawDonut(
  canvas: HTMLCanvasElement,
  ok: number,
  fail: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const size = 180;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const total = ok + fail || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;
  const line = 18;

  let start = -Math.PI / 2;
  const slices = [
    { val: ok, color: '#10a37f' },
    { val: fail, color: '#ef4444' },
  ];
  if (ok === 0 && fail === 0) {
    ctx.strokeStyle = '#e6e6e8';
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  slices.forEach(({ val, color }) => {
    if (!val) return;
    const angle = (val / total) * Math.PI * 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = line;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.stroke();
    start += angle;
  });
}

export function drawBarChart(
  canvas: HTMLCanvasElement,
  values: number[],
  colors: string[],
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 640;
  const h = canvas.clientHeight || 160;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const max = Math.max(...values, 1);
  const pad = { l: 16, r: 16, b: 24, t: 12 };
  const barW = Math.max(6, (w - pad.l - pad.r) / Math.max(values.length, 1) - 3);

  values.forEach((v, i) => {
    const barH = ((h - pad.t - pad.b) * v) / max;
    const x = pad.l + i * (barW + 3);
    const y = h - pad.b - barH;
    ctx.fillStyle = colors[i] ?? '#2563eb';
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, 3);
    ctx.fill();
  });
}

export function avg(nums: (number | null)[]) {
  const valid = nums.filter((n): n is number => n != null);
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

export function minMax(nums: (number | null)[]) {
  const valid = nums.filter((n): n is number => n != null);
  if (!valid.length) return null;
  return { min: Math.min(...valid), max: Math.max(...valid) };
}
