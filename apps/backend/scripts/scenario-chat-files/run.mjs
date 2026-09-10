#!/usr/bin/env node
/**
 * S10 — файлы в чате сделки.
 * Акцепт КП открывает чат «заявка ↔ поставщик». Заказчик кидает фото
 * (замер площадки), поставщик — PDF (счёт). Оба сообщения с вложениями
 * приходят обеим сторонам, превью видно в ленте.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PASSWORD, c, apiJson, apiUploadBuffer, must, health, registerOrLogin } from '../scenario-lib/huphup-client.mjs';
import { ensureSupplierWithProduct, setupAcceptedDeal } from '../scenario-lib/flows.mjs';
import { solidPng } from '../scenario-lib/png.mjs';
import { minimalPdf } from '../scenario-lib/pdf.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUYER = { email: 'buyer.chat@scenario.huphup.test', person: 'Гульнара Замер' };
const SUP = {
  email: 's.chat@scenario.huphup.test', person: 'Аскар Ламинат', company: 'ПолДом',
  productName: 'Ламинат 33 класс 8мм', productDesc: 'Ламинат 33 класс, 8 мм, фаска 4V. Упаковка 2.13 м².',
  unit: 'м²',
};

async function main() {
  const h = await health();
  c.ok(`бэкенд uptime ${h.uptimeSec}s`);
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  const supplier = await ensureSupplierWithProduct(SUP);

  c.step('1) Заявка → КП → акцепт (открылся чат)');
  const deal = await setupAcceptedDeal({
    buyerToken: buyer.token, supplier, price: 780_000, deliveryDays: 4,
    comment: 'Ламинат 33 класс, дуб натур. 8 упаковок в наличии, остальное под заказ.',
    request: {
      title: 'Ламинат 33 класс 8 мм — 220 м² в офис, Алматы',
      description: 'Требуется ламинат 33 класс, 8 мм, фаска, ~220 м². Алматы. Оплата через сейф-сделку.',
      quantity: '220 м²', deadline: '01.12.2026',
    },
  });
  c.ok(`чат ${deal.conversationId.slice(0, 8)}… по сделке ${deal.code}`);

  c.step('2) Заказчик отправляет фото замера');
  const photo = solidPng(1000, 700, [120, 144, 168], { stripes: true });
  const m1 = await apiUploadBuffer(
    `/conversations/${deal.conversationId}/messages/file`,
    buyer.token, photo, 'zamer-ofis.png', 'image/png',
    { body: 'Прикладываю замер офиса — по факту 214 м², плюс подрезка ~3%.' },
  );
  (m1.ok ? c.ok : c.fail)(`фото: HTTP ${m1.status}, вложений ${m1.data?.attachments?.length ?? 0}`);

  c.step('3) Поставщик отправляет счёт PDF');
  const pdf = minimalPdf([
    'PolDom LLP — Invoice #2026-0714',
    'Laminate 33 class 8mm, 220 m2',
    'Amount: 780 000 KZT (escrow via HupHup)',
    'Delivery: 4 days after payment is held',
  ]);
  const m2 = await apiUploadBuffer(
    `/conversations/${deal.conversationId}/messages/file`,
    supplier.token, pdf, 'schet-2026-0714.pdf', 'application/pdf',
    { body: 'Счёт во вложении. Как оплата встанет на удержание — грузим.' },
  );
  (m2.ok ? c.ok : c.fail)(`PDF: HTTP ${m2.status}, вложений ${m2.data?.attachments?.length ?? 0}`);

  c.step('4) Обе стороны видят оба вложения');
  const asBuyer = must(await apiJson(`/conversations/${deal.conversationId}/messages`, { token: buyer.token }), 'messages(buyer)');
  const asSupplier = must(await apiJson(`/conversations/${deal.conversationId}/messages`, { token: supplier.token }), 'messages(supplier)');
  const files = (items) => items.flatMap((m) => m.attachments ?? []).map((a) => a.fileName);
  c.ok(`у заказчика в ленте вложения: ${files(asBuyer.items).join(', ')}`);
  c.ok(`у поставщика в ленте вложения: ${files(asSupplier.items).join(', ')}`);

  const checks = [
    ['фото загрузилось', m1.ok && (m1.data.attachments?.[0]?.mimeType || '').startsWith('image/')],
    ['PDF загрузился', m2.ok && m2.data.attachments?.[0]?.mimeType === 'application/pdf'],
    ['оба файла видит заказчик', files(asBuyer.items).length === 2],
    ['оба файла видит поставщик', files(asSupplier.items).length === 2],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

  await writeFile(join(HERE, 'state.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    buyer: BUYER.email, supplierEmail: SUP.email,
    code: deal.code, conversationId: deal.conversationId,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  }, null, 2));

  console.log('\n' + '─'.repeat(66));
  console.log(failed === 0
    ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — фото и PDF ушли в чат сделки, видны обеим сторонам.\x1b[0m'
    : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
  console.log(`Заказчик: ${BUYER.email} · Поставщик: ${SUP.email} · пароль ${PASSWORD}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exit(1); });
