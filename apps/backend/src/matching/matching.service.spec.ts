import type { CompaniesService } from '../companies/companies.service';
import type { LeadCrmService } from '../crm/lead-crm.service';
import type { GeminiInlineFile, GeminiService } from '../gemini/gemini.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { MatchingService } from './matching.service';

type Attachment = {
  id: string;
  requestId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
};

function buildAttachment(over: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    requestId: 'request-1',
    fileName: 'spec.pdf',
    fileUrl: '/api/v1/media/att-1',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    createdAt: new Date(),
    ...over,
  };
}

describe('MatchingService — Gemini attachment matching', () => {
  let prisma: {
    request: { findUnique: jest.Mock };
    product: { findMany: jest.Mock };
    attachment: { findMany: jest.Mock };
    lead: { upsert: jest.Mock };
  };
  let gemini: { matchProducts: jest.Mock };
  let storage: { readAttachmentBytes: jest.Mock };
  let companies: { listMemberUserIds: jest.Mock };
  let crm: { logActivity: jest.Mock };
  let service: MatchingService;

  beforeEach(() => {
    prisma = {
      request: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1',
          code: 'REQ-1',
          title: 'Нужен цемент',
          description: 'M400, 50 мешков',
          rawText: null,
          category: 'materials',
          city: 'Алматы',
        }),
      },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      attachment: { findMany: jest.fn().mockResolvedValue([]) },
      lead: {
        upsert: jest.fn().mockResolvedValue({ id: 'lead-1' }),
      },
    };
    gemini = { matchProducts: jest.fn().mockResolvedValue([]) };
    storage = { readAttachmentBytes: jest.fn() };
    companies = { listMemberUserIds: jest.fn().mockResolvedValue([]) };
    crm = { logActivity: jest.fn().mockResolvedValue(undefined) };

    service = new MatchingService(
      prisma as unknown as PrismaService,
      companies as unknown as CompaniesService,
      gemini as unknown as GeminiService,
      crm as unknown as LeadCrmService,
      storage as unknown as StorageService,
    );
  });

  function attachmentsArgOf(call: jest.Mock): GeminiInlineFile[] {
    const [[arg]] = call.mock.calls as [[{ attachments: GeminiInlineFile[] }]];
    return arg.attachments;
  }

  it('downloads a readable attachment and passes it to Gemini as base64', async () => {
    prisma.attachment.findMany.mockResolvedValue([
      buildAttachment({ mimeType: 'image/jpeg', sizeBytes: 2048 }),
    ]);
    storage.readAttachmentBytes.mockResolvedValue(Buffer.from('fake-bytes'));

    await service.createLeadsForRequest('request-1');

    expect(storage.readAttachmentBytes).toHaveBeenCalledWith(
      '/api/v1/media/att-1',
    );
    const attachments = attachmentsArgOf(gemini.matchProducts);
    expect(attachments).toEqual([
      {
        mimeType: 'image/jpeg',
        data: Buffer.from('fake-bytes').toString('base64'),
      },
    ]);
  });

  it('skips attachment types Gemini cannot read (e.g. docx)', async () => {
    prisma.attachment.findMany.mockResolvedValue([
      buildAttachment({
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ]);

    await service.createLeadsForRequest('request-1');

    expect(storage.readAttachmentBytes).not.toHaveBeenCalled();
    expect(attachmentsArgOf(gemini.matchProducts)).toEqual([]);
  });

  it('skips attachments whose recorded size exceeds the cap', async () => {
    prisma.attachment.findMany.mockResolvedValue([
      buildAttachment({ sizeBytes: 9 * 1024 * 1024 }),
    ]);

    await service.createLeadsForRequest('request-1');

    expect(storage.readAttachmentBytes).not.toHaveBeenCalled();
    expect(attachmentsArgOf(gemini.matchProducts)).toEqual([]);
  });

  it('drops a downloaded file whose actual size exceeds the cap even if the recorded size did not', async () => {
    prisma.attachment.findMany.mockResolvedValue([
      buildAttachment({ sizeBytes: 100 }),
    ]);
    storage.readAttachmentBytes.mockResolvedValue(
      Buffer.alloc(9 * 1024 * 1024),
    );

    await service.createLeadsForRequest('request-1');

    expect(attachmentsArgOf(gemini.matchProducts)).toEqual([]);
  });

  it('caps the number of files sent to Gemini', async () => {
    prisma.attachment.findMany.mockResolvedValue([
      buildAttachment({ id: 'a1', fileUrl: '/api/v1/media/a1' }),
      buildAttachment({ id: 'a2', fileUrl: '/api/v1/media/a2' }),
      buildAttachment({ id: 'a3', fileUrl: '/api/v1/media/a3' }),
      buildAttachment({ id: 'a4', fileUrl: '/api/v1/media/a4' }),
    ]);
    storage.readAttachmentBytes.mockResolvedValue(Buffer.from('x'));

    await service.createLeadsForRequest('request-1');

    expect(storage.readAttachmentBytes).toHaveBeenCalledTimes(3);
  });

  it('keeps matching even when downloading one attachment throws', async () => {
    prisma.attachment.findMany.mockResolvedValue([
      buildAttachment({ id: 'bad', fileUrl: '/api/v1/media/bad' }),
      buildAttachment({ id: 'good', fileUrl: '/api/v1/media/good' }),
    ]);
    storage.readAttachmentBytes.mockImplementation((url: string) => {
      if (url.includes('bad')) throw new Error('boom');
      return Promise.resolve(Buffer.from('ok'));
    });

    await service.createLeadsForRequest('request-1');

    const attachments = attachmentsArgOf(gemini.matchProducts);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].data).toEqual(Buffer.from('ok').toString('base64'));
  });

  it('drops a file that downloads empty', async () => {
    prisma.attachment.findMany.mockResolvedValue([buildAttachment()]);
    storage.readAttachmentBytes.mockResolvedValue(null);

    await service.createLeadsForRequest('request-1');

    expect(attachmentsArgOf(gemini.matchProducts)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Резервный keyword-матчинг: путь, по которому идёт подбор, когда Gemini не
// настроен (GEMINI_API_KEY пуст) или вернул пусто. Именно он работает на
// локальном стенде и в сценарных прогонах.
// ---------------------------------------------------------------------------

type CatProduct = {
  id: string;
  name: string;
  description: string | null;
  city: string | null;
  company: {
    id: string;
    name: string;
    city: string | null;
    verified: boolean;
    rating: number;
  };
};

function product(
  over: Partial<CatProduct> & { companyId: string },
): CatProduct {
  return {
    id: `p-${over.companyId}`,
    name: 'Товар',
    description: null,
    city: null,
    ...over,
    company: {
      id: over.companyId,
      name: `Компания ${over.companyId}`,
      city: null,
      verified: false,
      rating: 0,
      ...(over.company ?? {}),
    },
  };
}

describe('MatchingService — keyword fallback (без Gemini)', () => {
  let prisma: {
    request: { findUnique: jest.Mock };
    product: { findMany: jest.Mock };
    attachment: { findMany: jest.Mock };
    lead: { upsert: jest.Mock };
  };
  let gemini: { matchProducts: jest.Mock };
  let companies: { listMemberUserIds: jest.Mock };
  let crm: { logActivity: jest.Mock };
  let service: MatchingService;

  type UpsertArg = {
    where: { requestId_companyId: { companyId: string } };
    create: { matchedProductId?: string | null; score?: number };
  };
  const upsertCalls = () =>
    prisma.lead.upsert.mock.calls as unknown as [UpsertArg][];
  const upsertedCompanyIds = () =>
    upsertCalls().map(([arg]) => arg.where.requestId_companyId.companyId);

  function setup(
    request: Partial<{
      title: string;
      description: string;
      rawText: string | null;
      category: string | null;
      city: string | null;
    }>,
    products: CatProduct[],
  ) {
    prisma = {
      request: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1',
          code: 'HH-1',
          title: 'Заявка',
          description: '',
          rawText: null,
          category: null,
          city: null,
          ...request,
        }),
      },
      product: { findMany: jest.fn().mockResolvedValue(products) },
      attachment: { findMany: jest.fn().mockResolvedValue([]) },
      lead: {
        upsert: jest.fn().mockImplementation((arg: UpsertArg) =>
          Promise.resolve({
            id: `lead-${arg.where.requestId_companyId.companyId}`,
          }),
        ),
      },
    };
    // Gemini "выключен": возвращает пусто -> включается keywordMatch
    gemini = { matchProducts: jest.fn().mockResolvedValue([]) };
    companies = { listMemberUserIds: jest.fn().mockResolvedValue(['user-1']) };
    crm = { logActivity: jest.fn().mockResolvedValue(undefined) };
    service = new MatchingService(
      prisma as unknown as PrismaService,
      companies as unknown as CompaniesService,
      gemini as unknown as GeminiService,
      crm as unknown as LeadCrmService,
      {} as unknown as StorageService,
    );
  }

  it('заводит лид каждой компании, чей товар совпал по словам заявки', async () => {
    setup(
      { description: 'Нужен профнастил С8 оцинкованный для кровли склада' },
      [
        product({
          companyId: 'a',
          name: 'Профнастил С8',
          description: 'оцинкованный лист для кровли',
        }),
        product({
          companyId: 'b',
          name: 'Профнастил С8 усиленный',
          description: 'оцинкованный, склад',
        }),
        product({
          companyId: 'c',
          name: 'Цемент М400',
          description: 'мешок 50 кг',
        }),
      ],
    );

    const created = await service.createLeadsForRequest('request-1');

    expect(upsertedCompanyIds().sort()).toEqual(['a', 'b']);
    expect(created).toHaveLength(2);
    expect(created.every((l) => l.score >= 55)).toBe(true);
  });

  it('берёт лучший товар компании, а не плодит дубли по одной компании', async () => {
    setup({ description: 'профнастил оцинкованный кровля склад' }, [
      product({
        id: 'weak',
        companyId: 'a',
        name: 'профнастил',
        description: '',
      }),
      product({
        id: 'strong',
        companyId: 'a',
        name: 'профнастил оцинкованный',
        description: 'кровля склад',
      }),
    ]);

    const created = await service.createLeadsForRequest('request-1');

    expect(created).toHaveLength(1);
    expect(prisma.lead.upsert).toHaveBeenCalledTimes(1);
    expect(upsertCalls()[0][0].create.matchedProductId).toBe('strong');
  });

  it('совпадение города поднимает score', async () => {
    setup({ description: 'профнастил оцинкованный', city: 'Алматы' }, [
      product({
        companyId: 'far',
        name: 'профнастил оцинкованный',
        city: 'Астана',
      }),
      product({
        companyId: 'near',
        name: 'профнастил оцинкованный',
        city: 'Алматы',
      }),
    ]);

    const created = await service.createLeadsForRequest('request-1');
    const byCompany = Object.fromEntries(
      created.map((l) => [l.companyId, l.score]),
    );

    expect(byCompany.near).toBeGreaterThan(byCompany.far);
  });

  it('ничего не совпало по словам — лидов нет', async () => {
    setup({ description: 'нужен погрузчик дизельный 3 тонны' }, [
      product({
        companyId: 'a',
        name: 'Профнастил С8',
        description: 'оцинкованный',
      }),
    ]);

    const created = await service.createLeadsForRequest('request-1');

    expect(created).toEqual([]);
    expect(prisma.lead.upsert).not.toHaveBeenCalled();
  });

  it('пустой запрос (нет заявки) — пустой результат, без обращения к каталогу', async () => {
    setup({}, []);
    prisma.request.findUnique.mockResolvedValue(null);

    const created = await service.createLeadsForRequest('missing');

    expect(created).toEqual([]);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('createDirectLead: адресный лид одной компании со score 100 и привязкой к товару', async () => {
    setup({}, []);

    const lead = await service.createDirectLead(
      'request-1',
      'company-x',
      'product-x',
      'Профнастил С8',
    );

    expect(lead).toMatchObject({
      companyId: 'company-x',
      productId: 'product-x',
      score: 100,
    });
    expect(prisma.lead.upsert).toHaveBeenCalledTimes(1);
    expect(upsertCalls()[0][0].create).toMatchObject({
      score: 100,
      matchedProductId: 'product-x',
    });
    expect(crm.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Direct product request' }),
    );
  });
});
