#!/usr/bin/env node
/**
 * S9 — приглашение менеджера в компанию.
 * Владелец компании приглашает менеджера по email → менеджер регистрируется
 * и принимает инвайт по ссылке → появляется в команде (роль SUPPLIER,
 * CompanyMember MANAGER) → владелец назначает ему лид → менеджер видит лид,
 * но переназначать не может (только владелец).
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PASSWORD, c, apiJson, must, health, registerOrLogin } from '../scenario-lib/huphup-client.mjs';
import { ensureSupplierWithProduct, publishRequest } from '../scenario-lib/flows.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUYER = { email: 'buyer.team@scenario.huphup.test', person: 'Виктор Закуп' };
const OWNER = {
  email: 'owner.team@scenario.huphup.test', person: 'Азамат Директор', company: 'СтальСервис KZ',
  productName: 'Арматура А500С 12мм', productDesc: 'Арматура А500С д.12, ГОСТ 34028. Хлысты 11.7 м, вязка/сварка.',
  unit: 'т', categories: ['Металлопрокат'],
};
const MANAGER = { email: 'manager.team@scenario.huphup.test', person: 'Ислам Менеджеров' };

async function main() {
  const h = await health();
  c.ok(`бэкенд uptime ${h.uptimeSec}s`);
  const buyer = await registerOrLogin(BUYER.email, BUYER.person, 'BUYER');
  const owner = await ensureSupplierWithProduct(OWNER);

  c.step('1) Владелец приглашает менеджера');
  let invite = await apiJson('/companies/me/invites', {
    method: 'POST', token: owner.token,
    body: { email: MANAGER.email, title: 'Менеджер по продажам', expiresInHours: 72 },
  });
  if (!invite.ok && invite.status === 409) {
    // активный инвайт уже есть — берём его из списка
    const list = must(await apiJson('/companies/me/invites', { token: owner.token }), 'list invites');
    invite = { ok: true, data: list.find((i) => i.email === MANAGER.email) };
  }
  must(invite, 'создание инвайта');
  const token = invite.data.token;
  c.ok(`инвайт для ${MANAGER.email}, ссылка ${invite.data.urlPath || `/invite/${token}`}`);

  c.step('2) Менеджер регистрируется и открывает ссылку');
  const manager = await registerOrLogin(MANAGER.email, MANAGER.person, 'BUYER');
  const preview = must(await apiJson(`/invites/${token}`), 'GET /invites/:token (public)');
  c.ok(`превью инвайта: компания «${preview.companyName ?? preview.company?.name ?? '—'}», роль ${preview.role ?? 'MANAGER'}`);

  c.step('3) Менеджер принимает инвайт');
  const accept = await apiJson(`/invites/${token}/accept`, { method: 'POST', token: manager.token });
  if (!accept.ok && !/already/i.test(accept.data?.message ?? '')) {
    throw new Error(`accept: ${accept.status} ${JSON.stringify(accept.data)}`);
  }
  const me = must(await apiJson('/users/me', { token: manager.token }), 'GET /users/me');
  c.ok(`менеджер принял: роль пользователя теперь ${me.role}`);

  c.step('4) Команда компании');
  const members = must(await apiJson('/companies/me/members', { token: owner.token }), 'members');
  const mgr = members.find((m) => m.user.email === MANAGER.email);
  c.ok(`в команде ${members.length}: ${members.map((m) => `${m.user.fullName} (${m.role})`).join(', ')}`);

  c.step('5) Владелец назначает менеджеру лид');
  const req = await publishRequest(buyer.token, {
    title: 'Арматура А500С 12 мм — 25 тонн на монолит, Алматы',
    description: 'Требуется арматура А500С д.12, ГОСТ 34028, 25 тонн. Алматы. Нужен сертификат и паспорт качества.',
    quantity: '25 т', deadline: '22.11.2026', category: 'Металлопрокат',
  });
  const ownerLeads = must(await apiJson('/leads', { token: owner.token }), 'owner leads');
  const lead = ownerLeads.find((l) => (l.request?.id || l.requestId) === req.id);
  if (!lead) throw new Error('лид не пришёл компании');
  const reassigned = must(
    await apiJson(`/leads/${lead.id}/reassign`, {
      method: 'POST', token: owner.token, body: { assigneeId: mgr.user.id },
    }),
    'reassign',
  );
  c.ok(`лид ${lead.request.code} назначен на ${reassigned.assignee?.fullName}`);

  c.step('6) Менеджер видит лид, но переназначить не может');
  const mgrLeads = must(await apiJson('/leads', { token: manager.token }), 'manager leads');
  const mgrSeesLead = mgrLeads.some((l) => l.id === lead.id);
  const mgrReassign = await apiJson(`/leads/${lead.id}/reassign`, {
    method: 'POST', token: manager.token, body: { assigneeId: owner.userId },
  });
  c.ok(`менеджер видит лид: ${mgrSeesLead ? 'да' : 'НЕТ'} · его reassign → HTTP ${mgrReassign.status} (ждём 403)`);

  const checks = [
    ['инвайт создан', Boolean(token)],
    ['после accept роль пользователя SUPPLIER', me.role === 'SUPPLIER'],
    ['менеджер в команде как MANAGER', mgr?.role === 'MANAGER'],
    ['лид назначен на менеджера', reassigned.assigneeId === mgr.user.id],
    ['менеджер видит назначенный лид', mgrSeesLead],
    ['менеджер не может переназначать (403)', mgrReassign.status === 403],
  ];
  c.step('Проверки');
  let failed = 0;
  for (const [n, ok] of checks) (ok ? c.ok : (m) => { failed++; c.fail(m); })(n);

  await writeFile(join(HERE, 'state.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    buyer: BUYER.email, ownerEmail: OWNER.email, managerEmail: MANAGER.email,
    inviteToken: token, requestId: req.id, code: req.code, leadId: lead.id,
    managerUserId: mgr?.user.id,
    result: failed === 0 ? 'PASS' : `FAIL (${failed})`,
  }, null, 2));

  console.log('\n' + '─'.repeat(66));
  console.log(failed === 0
    ? '\x1b[1;32mРЕЗУЛЬТАТ: PASS — менеджер принят в компанию по инвайту, владелец назначил ему лид.\x1b[0m'
    : `\x1b[1;31mРЕЗУЛЬТАТ: FAIL (${failed})\x1b[0m`);
  console.log(`Владелец: ${OWNER.email} · Менеджер: ${MANAGER.email} · пароль ${PASSWORD}`);
  if (failed) process.exitCode = 1;
}

main().catch((e) => { console.error('\n\x1b[1;31mУпал:\x1b[0m', e.stack || e.message); process.exit(1); });
