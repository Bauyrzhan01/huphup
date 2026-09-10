/**
 * Повторяющиеся куски воронки: поставщик с товаром, публикация заявки,
 * КП, акцепт (→ чат + сделка). Всё через реальный API.
 */
import {
  apiJson, must, registerOrLogin, ensureCompany, ensureProduct,
} from './huphup-client.mjs';

const CITY = 'Алматы';

export async function ensureSupplierWithProduct(s) {
  const { token, user } = await registerOrLogin(s.email, s.person, 'SUPPLIER');
  const company = await ensureCompany(token, {
    name: s.company, city: s.city ?? CITY,
    description: `${s.company} — ${s.desc ?? 'оптовые поставки'}. г. ${s.city ?? CITY}.`,
    categories: s.categories ?? ['Стройматериалы'],
  });
  const { product } = await ensureProduct(token, {
    name: s.productName, description: s.productDesc ?? s.productName,
    unit: s.unit ?? 'шт', city: s.city ?? CITY,
  });
  return { token, userId: user.id, companyId: company.id, productId: product.id, company: s.company };
}

export async function publishRequest(buyerToken, dto) {
  const created = must(
    await apiJson('/requests', {
      method: 'POST', token: buyerToken,
      body: {
        category: 'Стройматериалы', city: CITY,
        rawText: dto.description, ...dto,
      },
    }),
    'POST /requests',
  );
  const pub = must(
    await apiJson(`/requests/${created.id}/publish`, { method: 'POST', token: buyerToken }),
    'POST /requests/:id/publish',
  );
  return { id: created.id, code: created.code, leadsCreated: pub.leadsCreated, matchedSuppliers: pub.matchedSuppliers };
}

export async function sendOffer(supplierToken, requestId, offer) {
  return must(
    await apiJson('/offers', {
      method: 'POST',
      token: supplierToken,
      body: {
        requestId,
        price: offer.price,
        deliveryDays: offer.deliveryDays ?? 5,
        comment: offer.comment,
      },
    }),
    'POST /offers',
  );
}

export async function acceptOffer(buyerToken, offerId) {
  return must(
    await apiJson(`/offers/${offerId}/accept`, { method: 'POST', token: buyerToken }),
    'POST /offers/:id/accept',
  );
}

/** Заявка → одно КП → акцепт. Возвращает всё нужное для сценариев про сделки. */
export async function setupAcceptedDeal({ buyerToken, supplier, request, price = 900_000, deliveryDays = 5, comment = 'В наличии, отгрузка со склада' }) {
  const req = await publishRequest(buyerToken, request);
  const offer = must(
    await apiJson('/offers', {
      method: 'POST', token: supplier.token,
      body: { requestId: req.id, price, deliveryDays, comment },
    }),
    'POST /offers',
  );
  const accepted = await acceptOffer(buyerToken, offer.id);
  return {
    requestId: req.id, code: req.code, leadsCreated: req.leadsCreated,
    offerId: offer.id, dealId: accepted.dealId, conversationId: accepted.conversationId, price,
  };
}
