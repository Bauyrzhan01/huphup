import type { CompaniesService } from '../companies/companies.service';
import type {
  GeminiProductDraft,
  GeminiService,
} from '../gemini/gemini.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { ProductsService } from './products.service';

function build() {
  const companies = {
    requireCompanyForUser: jest.fn(() =>
      Promise.resolve({ company: { id: 'c1', city: 'Алматы' } }),
    ),
  };
  const gemini = {
    writeProductDraft: jest.fn<Promise<GeminiProductDraft | null>, []>(() =>
      Promise.resolve(null),
    ),
  };
  const prisma = {};
  const storage = {};

  const service = new ProductsService(
    prisma as unknown as PrismaService,
    companies as unknown as CompaniesService,
    gemini as unknown as GeminiService,
    storage as unknown as StorageService,
  );

  return { service, companies, gemini };
}

describe('ProductsService.aiDraft', () => {
  it('возвращает карточку, которую составила модель', async () => {
    const { service, gemini } = build();
    gemini.writeProductDraft.mockResolvedValue({
      name: 'Гипсокартон Knauf 12.5 мм',
      description: 'Влагостойкий лист, остатки со склада',
      unit: 'м²',
      category: 'Стройматериалы',
    });

    const result = await service.aiDraft('u1', {
      text: 'гипсокартон кнауф 12.5 остатки со склада',
    });

    expect(result).toEqual({
      name: 'Гипсокартон Knauf 12.5 мм',
      description: 'Влагостойкий лист, остатки со склада',
      unit: 'м²',
      category: 'Стройматериалы',
    });
  });

  it('передаёт город компании поставщика в запрос к модели', async () => {
    const { service, gemini } = build();

    await service.aiDraft('u1', { text: 'товар' });

    expect(gemini.writeProductDraft).toHaveBeenCalledWith({
      text: 'товар',
      city: 'Алматы',
    });
  });

  it('без модели честно собирает карточку из первой строки заметок, а не выдумывает', async () => {
    const { service } = build();

    const result = await service.aiDraft('u1', {
      text: 'Цемент М400 остатки\nоптом от 5 тонн',
    });

    expect(result).toEqual({
      name: 'Цемент М400 остатки',
      description: 'Цемент М400 остатки\nоптом от 5 тонн',
      unit: '',
      category: '',
    });
  });

  it('резервное имя не бывает пустым, даже если заметки — только пробелы', async () => {
    const { service } = build();

    const result = await service.aiDraft('u1', { text: '   ' });

    expect(result.name).toBe('Новый товар');
  });
});
