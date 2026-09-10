#!/usr/bin/env node
/**
 * S7 — сборка заявки через ИИ-чат (fallback без Gemini).
 * Заказчик пишет свободным текстом → /requests/analyze задаёт уточняющий
 * вопрос → /requests/analyze/clarify по ответам добивает недостающее
 * (марка, объём, срок) → как только ready=true, заявка создаётся и
 * публикуется, поставщики подбираются.
 *
 * В state.json кладём и восстановленный «диалог» для скрина главной.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PASSWORD, c, apiJson, must, health, registerOrLogin } from '../scenario-lib/huphup-client.mjs';
import { ensureSupplierWithProduct } from '../scenario-lib/flows.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUYER = { email: 'buyer.ai@scenario.huphup.test', person: 'Камиля Диалог' };
const SUP = {
  email: 's.ai@scenario.huphup.test', person: 'Тлек Цемент', company: 'ЦементКазОпт',
  productName: 'Цемент М400 ПЦ', productDesc: 'Портландцемент М400 (ПЦ 400-Д20), мешок 50 кг и навал. Оптом от 20 тонн.',
  unit: 'т',
};

const FIRST_TEXT = 'Нужен цемент для монолитного фундамента, объект в Алматы, привезти до 5 декабря';
const ANSWERS = ['М400', '25 тонн'];

async function main() {
  const h = await health();
  c.ok(`бэкенд uptime ${h.uptimeSec}s`);
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  await ensureSupplierWithProduct(SUP);

  c.step('1) Свободный текст → /requests/analyze');
  const chat = [{ role: 'user', text: FIRST_TEXT }];
  let res = must(await apiJson('/requests/analyze', { method: 'POST', body: { text: FIRST_TEXT } }), 'analyze');
  let q = res.questions?.[0];
  chat.push({ role: 'assistant', text: res.assistantMessage || q?.question, options: q?.options });
  c.ok(`ИИ спросил: «${res.assistantMessage || q?.question}»  ready=${res.ready}`);

  const collected = [];
  let userText = FIRST_TEXT;
  const messages = chat.map((m) => ({ role: m.role, content: m.text }));

  c.step('2) Уточняющий диалог → /requests/analyze/clarify');
  for (let i = 0; i < ANSWERS.length && !res.ready; i++) {
    const ans = ANSWERS[i];
    collected.push({ id: q?.id ?? `a${i + 1}`, answer: ans });
    userText += `\n${ans}`;
    chat.push({ role: 'user', text: ans });
    messages.push({ role: 'user', content: ans });
    res = must(await apiJson('/requests/analyze/clarify', {
      method: 'POST',
      body: { text: userText, answers: collected, previous: res, messages },
    }), 'clarify');
    q = res.questions?.[0];
    const line = res.ready ? (res.assistantMessage || 'Собрал заявку. Можно проверить и опубликовать.') : (res.assistantMessage || q?.question);
    chat.push({ role: 'assistant', text: line, options: res.ready ? undefined : q?.options });
    messages.push({ role: 'assistant', content: line });
    c.ok(`ответ «${ans}» → ${res.ready ? 'ГОТОВО' : `следующий вопрос: «${q?.question}»`}`);
  }

  if (!res.ready) throw new Error(`диалог не сошёлся к ready за ${ANSWERS.length} ответа`);

  c.step('3) Заявка создаётся и публикуется');
  const created = must(await apiJson('/requests', {
    method: 'POST', token: buyer.token,
    body: {
      title: res.title || 'Цемент М400',
      description: res.description,
      category: res.category || 'Стройматериалы',
      city: res.city || 'Алматы',
      quantity: res.quantity,
      deadline: res.deadline,
      rawText: userText,
    },
  }), 'POST /requests');
  const pub = must(await apiJson(`/requests/${created.id}/publish`, { method: 'POST', token: buyer.token }), 'publish');
  c.ok(`${created.code} опубликована · title «${created.title}» · подобрано: ${pub.leadsCreated}`);

  const homeChat = {
    chat,
    originalText: userText,
    analyzed: res,
    answers: collected,
    title: res.title,
    description: res.description,
    city: res.city || 'Алматы',
    deadline: res.deadline || '',
  };

  const checks = [
    ['analyze задал вопрос (не сразу ready)', chat[1].role === 'assistant'],
    ['после ответов ready=true', res.ready === true],
    ['собрался заголовок', Boolean((res.title || '').trim())],
    ['в описании есть марка М400', /м\s*-?\s*400/i.test(res.description || '')],
    ['заявка опубликована и подобраны поставщики', created.code && pub.leadsCreated >= 1],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

  await writeFile(join(HERE, 'state.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    buyer: BUYER.email, buyerUserId: buyer.user.id, supplierEmail: SUP.email,
    requestId: created.id, code: created.code,
    dialogTurns: chat.length,
    homeChatKey: `huphup_home_chat_${buyer.user.id}`,
    homeChat,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  }, null, 2));

  console.log('\n' + '─'.repeat(66));
  console.log(failed === 0
    ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — ИИ-чат собрал заявку из свободного текста и опубликовал её.\x1b[0m'
    : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
  console.log(`Заказчик: ${BUYER.email} / ${PASSWORD}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exit(1); });
