export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.MONITOR_SECRET;
  const url =
    process.env.OPS_URL ??
    'https://api-production-8ac1f.up.railway.app/api/v1/ops/snapshot';

  if (!secret) {
    res.status(503).json({ message: 'MONITOR_SECRET is not set on Vercel' });
    return;
  }

  try {
    const upstream = await fetch(url, {
      cache: 'no-store',
      headers: { 'x-monitor-secret': secret },
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/json',
    );
    res.send(body);
  } catch (err) {
    res.status(502).json({
      message:
        err instanceof Error
          ? err.message
          : 'Upstream failed — Railway API is likely down',
    });
  }
}
