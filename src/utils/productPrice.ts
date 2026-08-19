export function formatProductPrice(
  priceFrom?: string | number | null,
  currency?: string | null,
) {
  if (priceFrom == null || priceFrom === '') return null;
  const n = Number(priceFrom);
  const amount = Number.isFinite(n)
    ? new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 2 }).format(n)
    : String(priceFrom);
  return `${amount} ${currency || 'KZT'}`.trim();
}
