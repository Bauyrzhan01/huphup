#!/usr/bin/env node
/**
 * Сквозная воронка HupHup: заявка → 5 КП → выбор → чат → escrow-сделка →
 * (в отдельной ветке) спор → возврат админом.
 *
 *   S2  R1: 5 поставщиков шлют КП с разной ценой/сроком → заказчик сравнивает,
 *           принимает лучшее по цене → открывается чат, рождается сделка.
 *   S3  R1: заказчику пополняют кошелёк (админ) → оплата (деньги на удержании)
 *           → поставщик отгружает → заказчик подтверждает → деньги у поставщика.
 *   S4  R2: вторая заявка, принятое КП, оплата, отгрузка → заказчик открывает
 *           спор → админ в панели делает возврат покупателю.
 *
 * Пишет state.json (id заявок/сделок/чата, балансы, логины) — его читает
 * screenshot.mjs.
 *
 * Требует поднятый бэкенд (:3000). Идемпотентно по аккаунтам/компаниям/товарам,
 * заявки/КП/сделки создаёт новые на каждый прогон.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  API_BASE, PASSWORD, c,
  apiJson, must, health, registerOrLogin, ensureCompany, ensureProduct,
} from '../scenario-lib/huphup-client.mjs';
import { ensureAdmin, topUpUserWallet } from '../scenario-lib/ensure-admin.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CITY = 'Алматы';
const PRODUCT_NAME = 'Профнастил С8';

const SUPPLIERS = [
  { key: 'stroymetall',  email: 's1.stroymetall@scenario.huphup.test',  person: 'Арман Досжанов',  company: 'СтройМеталл Алматы',
    desc: 'Профнастил С8 оцинкованный, стеновой профилированный лист для кровли и стен. RAL 9003 белый, 0.45 мм, полиэстер. Склад в Алматы.',
    offer: { price: 1_450_000, deliveryDays: 5, comment: 'RAL 9003, 0.45 мм. Есть на складе, самовывоз или доставка по городу.' } },
  { key: 'krovlyapro',   email: 's2.krovlyapro@scenario.huphup.test',   person: 'Динара Ныгметова', company: 'КровляПро KZ',
    desc: 'Профнастил С8 оцинкованный без покрытия, стеновой профилированный лист для кровли и заборов. 0.50 мм, цинк Zn140. Режем в размер, склад в Алматы.',
    offer: { price: 1_200_000, deliveryDays: 7, comment: 'Оцинковка без покрытия 0.50 мм. Лучшая цена, отгрузка партии за 7 дней.' } },
  { key: 'metallprofil', email: 's3.metallprofil@scenario.huphup.test', person: 'Ерлан Сапаров',    company: 'МеталлПрофиль Астана-Юг',
    desc: 'Профнастил С8, стеновой профилированный лист, оцинкованный с полимерным покрытием. RAL 8017 коричневый, 0.50 мм, полиэстер матовый. Склад в Алматы.',
    offer: { price: 1_575_000, deliveryDays: 4, comment: 'RAL 8017 матовый, гарантия на цинк 10 лет. Быстрая отгрузка — 4 дня.' } },
  { key: 'grandsteel',   email: 's4.grandsteel@scenario.huphup.test',   person: 'Тимур Ахметов',     company: 'Grand Steel',
    desc: 'Профнастил С8 оцинкованный, эконом-профлист. RAL 6005 зелёный, 0.40 мм, полиэстер. Стеновой профилированный лист для навесов и кровли склада. Алматы.',
    offer: { price: 1_375_000, deliveryDays: 6, comment: 'Эконом 0.40 мм RAL 6005. Дешевле рынка, срок 6 дней.' } },
  { key: 'aktorgmetall', email: 's5.aktorgmetall@scenario.huphup.test', person: 'Сауле Ким',        company: 'АкТоргМеталл',
    desc: 'Профнастил С8 усиленный, оцинкованный, стеновой профилированный лист. RAL 5005 синий, 0.55 мм, полиэстер. Длина листа до 6 м под заказ. Самовывоз в Алматы.',
    offer: { price: 1_700_000, deliveryDays: 3, comment: 'Усиленный 0.55 мм, режем под 6 м. Отгрузим за 3 дня, но дороже.' } },
];

const BUYER = { email: 'buyer.profnastil@scenario.huphup.test', person: 'Мади Оспанов' };

const CHAT_R1 = [
  { who: 'buyer',    text: 'Здравствуйте! По КП всё устраивает. Оплату проведём через сейф-сделку HupHup. Когда сможете отгрузить?' },
  { who: 'supplier', text: 'Добрый день! Как деньги встанут на удержание — отгружаем в течение 7 дней, транспорт наш. Пришлём накладную сюда же.' },
  { who: 'buyer',    text: 'Отлично, оплачиваю.' },
];

async function bootSuppliers() {
  c.step('0) Аккаунты, компании, товары');
  const out = [];
  for (const s of SUPPLIERS) {
    const { token, user } = await registerOrLogin(s.email, s.person, 'SUPPLIER');
    const company = await ensureCompany(token, {
      name: s.company, city: CITY,
      description: `${s.company} — металлопрокат, профнастил, кровля. г. ${CITY}.`,
      categories: ['Стройматериалы'],
    });
    const { product } = await ensureProduct(token, {
      name: PRODUCT_NAME, description: s.desc, unit: 'лист', city: CITY,
    });
    out.push({ ...s, token, userId: user.id, companyId: company.id, productId: product.id });
  }
  c.ok(`${out.length} поставщика готовы (товар «${PRODUCT_NAME}» у каждого)`);
  return out;
}

async function publishRequest(buyerToken, { title, description, quantity, deadline }) {
  const created = must(
    await apiJson('/requests', {
      method: 'POST', token: buyerToken,
      body: { title, description, category: 'Стройматериалы', city: CITY, quantity, deadline, rawText: description },
    }),
    'POST /requests',
  );
  const pub = must(
    await apiJson(`/requests/${created.id}/publish`, { method: 'POST', token: buyerToken }),
    'POST /requests/:id/publish',
  );
  return { id: created.id, code: created.code, leadsCreated: pub.leadsCreated };
}

async function sendOffers(suppliers, requestId) {
  const offers = [];
  for (const s of suppliers) {
    const offer = must(
      await apiJson('/offers', {
        method: 'POST', token: s.token,
        body: { requestId, price: s.offer.price, deliveryDays: s.offer.deliveryDays, comment: s.offer.comment },
      }),
      `POST /offers (${s.company})`,
    );
    offers.push({ company: s.company, offerId: offer.id, price: s.offer.price, deliveryDays: s.offer.deliveryDays });
    c.info(`${s.company}: ${s.offer.price.toLocaleString('ru')} ₸ · ${s.offer.deliveryDays} дн.`);
  }
  return offers;
}

async function walletBalance(token) {
  const w = must(await apiJson('/billing/wallet', { token }), 'GET /billing/wallet');
  return Number(w.balance);
}

async function main() {
  const h = await health();
  c.ok(`бэкенд доступен (uptime ${h.uptimeSec}s), API ${API_BASE}`);

  const admin = await ensureAdmin();
  c.ok(`админ ${admin.email}`);

  const suppliers = await bootSuppliers();
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  const byCompany = Object.fromEntries(suppliers.map((s) => [s.company, s]));

  // ================= S2 — R1: 5 КП → выбор ==============================
  c.step('S2) Заявка R1 · 5 КП · выбор лучшего');
  const r1 = await publishRequest(buyer.token, {
    title: `Профнастил С8 оцинкованный — 500 листов для кровли цеха, ${CITY}`,
    description:
      'Требуется профнастил С8 оцинкованный, стеновой профилированный лист, для кровли ' +
      'производственного цеха. 500 листов, длина 2000 мм, толщина 0.45–0.55 мм. ' +
      'Город Алматы, самовывоз или доставка по городу, оплата через сейф-сделку.',
    quantity: '500 листов', deadline: '25.10.2026',
  });
  c.ok(`R1 ${r1.code} опубликована · подобрано поставщиков: ${r1.leadsCreated}`);

  const r1offers = await sendOffers(suppliers, r1.id);

  const compare = must(
    await apiJson(`/offers/by-request/${r1.id}`, { token: buyer.token }),
    'GET /offers/by-request',
  );
  const cheapest = [...compare].sort((a, b) => Number(a.price) - Number(b.price))[0];
  c.ok(`заказчик видит ${compare.length} КП, лучшее по цене — ${cheapest.company.name} (${Number(cheapest.price).toLocaleString('ru')} ₸)`);

  const accepted = must(
    await apiJson(`/offers/${cheapest.id}/accept`, { method: 'POST', token: buyer.token }),
    'POST /offers/:id/accept',
  );
  c.ok(`КП принято → чат ${accepted.conversationId.slice(0, 8)}… · сделка ${accepted.dealId.slice(0, 8)}…`);

  const winner = byCompany[cheapest.company.name];
  for (const m of CHAT_R1) {
    const token = m.who === 'buyer' ? buyer.token : winner.token;
    must(
      await apiJson(`/conversations/${accepted.conversationId}/messages`, {
        method: 'POST', token, body: { body: m.text },
      }),
      'POST /conversations/:id/messages',
    );
  }
  c.ok(`в чат отправлено ${CHAT_R1.length} сообщения`);

  // ================= S3 — R1: escrow happy-path ========================
  c.step('S3) R1 · оплата → отгрузка → подтверждение → выплата');
  const buyerBefore = await walletBalance(buyer.token);
  const topup = await topUpUserWallet(admin.token, buyer.user.id, 3_000_000, 'Сценарий: бюджет на сделки R1+R2');
  c.ok(`админ пополнил кошелёк заказчика: ${Number(buyerBefore).toLocaleString('ru')} → ${Number(topup.balance).toLocaleString('ru')} ₸`);

  const paidR1 = must(await apiJson(`/deals/${accepted.dealId}/pay`, { method: 'POST', token: buyer.token }), 'POST /deals/:id/pay');
  c.ok(`заказчик оплатил R1 → статус ${paidR1.status} (деньги на удержании площадки)`);

  const shippedR1 = must(await apiJson(`/deals/${accepted.dealId}/ship`, { method: 'POST', token: winner.token }), 'POST /deals/:id/ship');
  c.ok(`${winner.company} отгрузил → статус ${shippedR1.status}, автовыпуск ${new Date(shippedR1.autoReleaseAt).toLocaleDateString('ru')}`);

  const confirmedR1 = must(await apiJson(`/deals/${accepted.dealId}/confirm`, { method: 'POST', token: buyer.token }), 'POST /deals/:id/confirm');
  const supplierWallet = await walletBalance(winner.token);
  c.ok(`заказчик подтвердил получение → статус ${confirmedR1.status} · на кошельке «${winner.company}»: ${supplierWallet.toLocaleString('ru')} ₸ (выплата ${confirmedR1.payout})`);

  // ================= S4 — R2: спор → возврат админом ===================
  c.step('S4) Заявка R2 · оплата · отгрузка · спор · возврат админом');
  const r2 = await publishRequest(buyer.token, {
    title: `Профнастил С8 оцинкованный — 300 листов для навеса, ${CITY}`,
    description:
      'Нужен профнастил С8 оцинкованный, стеновой профилированный лист, для навеса ' +
      'над стоянкой. 300 листов, длина 2000 мм. Алматы, самовывоз, оплата через сейф-сделку.',
    quantity: '300 листов', deadline: '15.11.2026',
  });
  c.ok(`R2 ${r2.code} опубликована · подобрано поставщиков: ${r2.leadsCreated}`);

  await sendOffers(suppliers, r2.id);
  const r2compare = must(await apiJson(`/offers/by-request/${r2.id}`, { token: buyer.token }), 'GET /offers/by-request');
  // на этот раз берём не самый дешёвый, а средний по сроку — просто другой выбор
  const pick = [...r2compare].sort((a, b) => (a.deliveryDays ?? 99) - (b.deliveryDays ?? 99))[1] ?? r2compare[0];
  const acceptedR2 = must(await apiJson(`/offers/${pick.id}/accept`, { method: 'POST', token: buyer.token }), 'POST /offers/:id/accept');
  const loser = byCompany[pick.company.name];
  c.ok(`заказчик принял КП ${loser.company} (${Number(pick.price).toLocaleString('ru')} ₸) → сделка ${acceptedR2.dealId.slice(0, 8)}…`);

  must(await apiJson(`/deals/${acceptedR2.dealId}/pay`, { method: 'POST', token: buyer.token }), 'POST /deals/:id/pay R2');
  const shippedR2 = must(await apiJson(`/deals/${acceptedR2.dealId}/ship`, { method: 'POST', token: loser.token }), 'POST /deals/:id/ship R2');
  c.ok(`R2 оплачена и отгружена → ${shippedR2.status}`);

  const DISPUTE_REASON =
    'Привезли 220 листов вместо 300, часть листов с заломами по кромке и следами коррозии. ' +
    'Просил замену или возврат — поставщик не отвечает третий день.';
  const disputed = must(
    await apiJson(`/deals/${acceptedR2.dealId}/dispute`, { method: 'POST', token: buyer.token, body: { reason: DISPUTE_REASON } }),
    'POST /deals/:id/dispute',
  );
  c.ok(`заказчик открыл спор → статус ${disputed.status}`);

  const adminDisputed = must(await apiJson('/admin/deals?status=DISPUTED', { token: admin.token }), 'GET /admin/deals?status=DISPUTED');
  c.ok(`в админ-панели споров: ${adminDisputed.length} (видна сделка по ${r2.code})`);
  c.info('решение спора (возврат/выдачу) делает админ в панели — см. screenshot.mjs');

  // ================= проверки + state.json ============================
  const checks = [
    ['R1: 5 leads', r1.leadsCreated === 5],
    ['R1: 5 КП у заказчика', compare.length === 5],
    ['R1: принят самый дешёвый', Number(cheapest.price) === Math.min(...r1offers.map((o) => o.price))],
    ['R1: сделка RELEASED', confirmedR1.status === 'RELEASED'],
    ['R1: поставщику пришла выплата', supplierWallet >= Number(confirmedR1.payout) && supplierWallet > 0],
    ['R2: 5 leads', r2.leadsCreated === 5],
    ['R2: сделка DISPUTED', disputed.status === 'DISPUTED'],
    ['R2: спор виден админу', adminDisputed.some((d) => d.id === acceptedR2.dealId)],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [name, pass] of checks) (pass ? c.ok : (m) => { failed++; c.fail(m); })(name);

  const state = {
    runAt: new Date().toISOString(),
    api: API_BASE,
    admin: { email: admin.email, password: PASSWORD, userId: admin.userId },
    buyer: { email: BUYER.email, userId: buyer.user.id },
    suppliers: suppliers.map((s) => ({ company: s.company, email: s.email, companyId: s.companyId })),
    r1: {
      code: r1.code, requestId: r1.id,
      offers: r1offers,
      acceptedCompany: cheapest.company.name,
      conversationId: accepted.conversationId,
      dealId: accepted.dealId,
      dealStatus: confirmedR1.status,
      payout: confirmedR1.payout,
      supplierWalletAfter: supplierWallet,
      winnerEmail: winner.email,
    },
    r2: {
      code: r2.code, requestId: r2.id,
      acceptedCompany: pick.company.name,
      dealId: acceptedR2.dealId,
      dealAmount: Number(pick.price),
      dealStatus: disputed.status,
      disputeReason: DISPUTE_REASON,
      loserEmail: loser.email,
    },
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  };
  await writeFile(join(HERE, 'state.json'), JSON.stringify(state, null, 2));

  console.log('\n' + '─'.repeat(72));
  console.log(
    failed === 0
      ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — R1: КП → выбор → чат → оплата → отгрузка → выплата. R2: оплата → отгрузка → спор (ждёт решения админа).\x1b[0m'
      : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed}) — см. state.json\x1b[0m`,
  );
  console.log('Логины (пароль у всех ' + PASSWORD + '):');
  console.log(`  заказчик:  ${BUYER.email}`);
  console.log(`  R1 победитель: ${winner.email} (${winner.company})`);
  console.log(`  R2 поставщик:  ${loser.email} (${loser.company})`);
  console.log(`  админ:     ${admin.email}  (панель :5175)`);
  console.log('state.json — полный отчёт. Дальше: node screenshot.mjs');
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error('\n\x1b[1;31mСценарий упал:\x1b[0m', e.stack || e.message);
  process.exit(1);
});
