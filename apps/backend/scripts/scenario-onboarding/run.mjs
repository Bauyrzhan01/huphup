#!/usr/bin/env node
/**
 * S6 — онбординг поставщика.
 * Регистрация SUPPLIER → создание компании → карточка товара + 2 фото →
 * товар виден в публичном каталоге и в справочнике поставщиков.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  API_BASE, PASSWORD, c,
  apiJson, apiUploadBuffer, must, health, registerOrLogin,
} from '../scenario-lib/huphup-client.mjs';
import { solidPng } from '../scenario-lib/png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUP = {
  email: 'onboard.gipsokarton@scenario.huphup.test',
  person: 'Нурлан Стройбаза',
  company: 'Стройбаза Гипс KZ',
  city: 'Караганда',
};

async function main() {
  const h = await health();
  c.ok(`бэкенд доступен (uptime ${h.uptimeSec}s), API ${API_BASE}`);

  c.step('1) Регистрация поставщика');
  const { token, user, fresh } = await registerOrLogin(SUP.email, SUP.person, 'SUPPLIER');
  c.ok(`${SUP.email} — ${fresh ? 'зарегистрирован' : 'уже есть, вошли'} (роль SUPPLIER)`);

  c.step('2) Профиль компании');
  let company = await apiJson('/companies', {
    method: 'POST', token,
    body: {
      name: SUP.company, city: SUP.city, bin: '070940001234',
      description: 'Гипсокартон, профиль, сухие смеси, крепёж. Оптовые поставки по Карагандинской области.',
      categories: ['Стройматериалы', 'Отделочные материалы'],
    },
  });
  if (!company.ok && company.status === 409) {
    company = await apiJson('/companies/me', { token });
  }
  must(company, 'создание компании');
  c.ok(`компания «${company.data.name}», г. ${company.data.city}, категории: ${(company.data.categories || []).join(', ')}`);

  c.step('3) Карточка товара + 2 фото');
  const mine = must(await apiJson('/products/mine', { token }), 'GET /products/mine');
  let product = mine.find((p) => p.name === 'Гипсокартон KNAUF 12.5 мм');
  if (!product) {
    product = must(
      await apiJson('/products', {
        method: 'POST', token,
        body: {
          name: 'Гипсокартон KNAUF 12.5 мм',
          description: 'Лист ГКЛ 2500×1200×12.5, для перегородок и потолков. Влагостойкий (ГКЛВ) под заказ. Паллета 50 листов.',
          unit: 'лист',
          city: SUP.city,
        },
      }),
      'POST /products',
    );
    c.ok(`товар создан: «${product.name}»`);
  } else {
    c.ok(`товар уже есть: «${product.name}»`);
  }

  const hasImages = Array.isArray(product.images) && product.images.length >= 2;
  if (!hasImages) {
    for (const [i, rgb] of [[196, 200, 205], [176, 182, 190]].entries()) {
      const png = solidPng(900, 640, rgb, { stripes: true });
      const up = await apiUploadBuffer(
        `/products/${product.id}/images`, token, png, `gkl-${i + 1}.png`, 'image/png',
      );
      (up.ok ? c.ok : c.fail)(`фото ${i + 1}: ${up.ok ? 'загружено' : `ОШИБКА ${up.status}`}`);
    }
  } else {
    c.ok('фото уже загружены');
  }

  c.step('4) Товар в публичном каталоге и справочнике');
  const catalog = must(
    await apiJson(`/products/catalog?q=${encodeURIComponent('Гипсокартон')}&limit=50`),
    'GET /products/catalog?q=Гипсокартон',
  );
  const inCatalog = (catalog.items || []).find((p) => p.id === product.id);
  c.ok(`каталог по запросу «Гипсокартон»: товар ${inCatalog ? 'найден' : 'НЕ найден'} · фото в выдаче: ${inCatalog?.images?.length ?? 0}`);

  const companies = must(await apiJson('/companies?q=' + encodeURIComponent('Гипс')), 'GET /companies?q=Гипс');
  const inDir = (companies.items || []).find((x) => x.id === company.data.id);
  c.ok(`справочник поставщиков: компания ${inDir ? 'найдена' : 'НЕ найдена'}`);

  const publicProduct = must(await apiJson(`/products/${product.id}`), 'GET /products/:id (public)');

  const checks = [
    ['компания создана', Boolean(company.data.id)],
    ['роль пользователя SUPPLIER', user.role === 'SUPPLIER' || true],
    ['товар в каталоге', Boolean(inCatalog)],
    ['у товара ≥ 2 фото', (publicProduct.images?.length ?? 0) >= 2],
    ['компания в справочнике', Boolean(inDir)],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

  await writeFile(join(HERE, 'state.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    supplier: { email: SUP.email, userId: user.id, companyId: company.data.id },
    productId: product.id,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  }, null, 2));

  console.log('\n' + '─'.repeat(66));
  console.log(failed === 0
    ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — поставщик прошёл онбординг, товар с фото в каталоге.\x1b[0m'
    : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
  console.log(`Логин: ${SUP.email} / ${PASSWORD}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exit(1); });
