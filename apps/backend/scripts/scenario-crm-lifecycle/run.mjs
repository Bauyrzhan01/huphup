#!/usr/bin/env node
/**
 * S8 — работа поставщика с лидом в CRM.
 * Заявка падает поставщику лидом → менеджер открывает (VIEWED) → берёт в
 * работу (CLAIMED) → ставит следующий шаг → пишет заметку → заводит задачу
 * (звонок) → меняет статус. Лента активности собирает всю историю.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PASSWORD, c, apiJson, must, health, registerOrLogin } from '../scenario-lib/huphup-client.mjs';
import { ensureSupplierWithProduct, publishRequest } from '../scenario-lib/flows.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUYER = { email: 'buyer.crm@scenario.huphup.test', person: 'Ольга Снабжение' };
const SUP = {
  email: 's.crm@scenario.huphup.test', person: 'Бекзат Кабель', company: 'ЭлектроОпт',
  productName: 'Кабель ВВГнг-LS 3×2.5', productDesc: 'Кабель ВВГнг(А)-LS 3×2.5, медь, ГОСТ. Бухта 100 м. Для розеточных групп.',
  unit: 'м', categories: ['Электрика'],
};

async function main() {
  const h = await health();
  c.ok(`бэкенд uptime ${h.uptimeSec}s`);
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  const supplier = await ensureSupplierWithProduct(SUP);

  c.step('1) Заявка → лид поставщику');
  const req = await publishRequest(buyer.token, {
    title: 'Кабель ВВГнг-LS 3×2.5 — 4000 м на объект, Алматы',
    description: 'Требуется кабель ВВГнг(А)-LS 3×2.5, медь, ГОСТ, 4000 м (40 бухт). Алматы. Нужны сертификаты.',
    quantity: '4000 м', deadline: '18.11.2026',
  });
  const leads = must(await apiJson('/leads', { token: supplier.token }), 'GET /leads');
  const lead = leads.find((l) => (l.request?.id || l.requestId) === req.id);
  if (!lead) throw new Error('лид не пришёл поставщику');
  c.ok(`лид ${lead.request.code} · статус ${lead.status} · ответственный: ${lead.assignee?.fullName ?? 'не назначен'}`);

  c.step('2) Открыть лид (событие «просмотрен»)');
  const viewed = must(await apiJson(`/leads/${lead.id}/view`, { method: 'POST', token: supplier.token }), 'view');
  c.ok(`просмотр зафиксирован (статус ${viewed.status})`);

  c.step('3) Взять в работу (CLAIMED → VIEWED)');
  const claimed = must(await apiJson(`/leads/${lead.id}/claim`, { method: 'POST', token: supplier.token }), 'claim');
  c.ok(`ответственный → ${claimed.assignee?.fullName}, статус ${claimed.status}, claimedAt ${claimed.claimedAt ? 'есть' : 'нет'}`);

  c.step('4) Следующий шаг');
  const at = new Date(Date.now() + 2 * 864e5).toISOString();
  must(await apiJson(`/leads/${lead.id}/next-step`, {
    method: 'PATCH', token: supplier.token,
    body: { text: 'Отправить КП с ценой за бухту и сертификатами', at },
  }), 'next-step');
  c.ok('следующий шаг задан на +2 дня');

  c.step('5) Заметка');
  must(await apiJson(`/leads/${lead.id}/notes`, {
    method: 'POST', token: supplier.token,
    body: { body: 'Созвон: нужен именно ГОСТ (не ТУ), объект сдаётся в декабре. Готовы взять всё одной партией при скидке от 3%.' },
  }), 'note');
  c.ok('заметка добавлена');

  c.step('6) Задача-звонок');
  must(await apiJson(`/leads/${lead.id}/tasks`, {
    method: 'POST', token: supplier.token,
    body: { title: 'Перезвонить по объёму и срокам', kind: 'CALL', dueAt: at, priority: 'HIGH' },
  }), 'task');
  c.ok('задача (звонок, HIGH) создана');

  c.step('7) Смена статуса');
  const statusChanged = must(await apiJson(`/leads/${lead.id}/status`, {
    method: 'PATCH', token: supplier.token, body: { status: 'VIEWED' },
  }), 'status');

  const [activities, notes, tasks] = await Promise.all([
    apiJson(`/leads/${lead.id}/activities`, { token: supplier.token }).then((r) => r.data),
    apiJson(`/leads/${lead.id}/notes`, { token: supplier.token }).then((r) => r.data),
    apiJson(`/leads/${lead.id}/tasks`, { token: supplier.token }).then((r) => r.data),
  ]);
  const types = activities.map((a) => a.type);
  c.ok(`лента активности (${activities.length}): ${types.join(' → ')}`);
  c.ok(`заметок ${notes.length} · задач ${tasks.length}`);

  const checks = [
    ['лид создан и виден поставщику', Boolean(lead)],
    ['просмотр залогирован (VIEWED в ленте)', types.includes('VIEWED')],
    ['после claim статус VIEWED и есть ответственный', claimed.status === 'VIEWED' && Boolean(claimed.assigneeId)],
    ['в ленте есть CREATED', types.includes('CREATED')],
    ['в ленте есть CLAIMED', types.includes('CLAIMED')],
    ['в ленте есть NEXT_STEP_SET', types.includes('NEXT_STEP_SET')],
    ['заметка сохранилась', notes.length === 1],
    ['задача сохранилась (CALL)', tasks.length === 1 && tasks[0].kind === 'CALL'],
    ['статус применился', statusChanged.status === 'VIEWED'],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

  await writeFile(join(HERE, 'state.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    buyer: BUYER.email, supplierEmail: SUP.email,
    requestId: req.id, code: req.code, leadId: lead.id,
    activities: types, notes: notes.length, tasks: tasks.length,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  }, null, 2));

  console.log('\n' + '─'.repeat(66));
  console.log(failed === 0
    ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — лид проведён по CRM: open → claim → next-step → note → task → status.\x1b[0m'
    : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
  console.log(`Поставщик: ${SUP.email} / ${PASSWORD}  ·  лид: /supplier/leads?leadId=${lead.id}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exit(1); });
