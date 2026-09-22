import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateProductDto,
  ProductCatalogQueryDto,
  UpdateProductDto,
} from './product.dto';

// Ровно те опции, что стоят в глобальном ValidationPipe (main.ts).
const PIPE_OPTS = { whitelist: true, forbidNonWhitelisted: true } as const;

describe('ProductCatalogQueryDto', () => {
  it('пропускает q / city / page / limit публичного каталога', async () => {
    const dto = plainToInstance(ProductCatalogQueryDto, {
      q: 'профнастил',
      city: 'Алматы',
      page: '2',
      limit: '30',
    });

    const errors = await validate(dto, PIPE_OPTS);

    expect(errors).toHaveLength(0);
    // @Type(() => Number) приводит строки из query к числам
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(30);
  });

  it('пустой query валиден (все поля опциональны)', async () => {
    const dto = plainToInstance(ProductCatalogQueryDto, {});
    expect(await validate(dto, PIPE_OPTS)).toHaveLength(0);
  });

  it('посторонний параметр всё так же отбраковывается', async () => {
    const dto = plainToInstance(ProductCatalogQueryDto, { q: 'x', bogus: '1' });
    const errors = await validate(dto, PIPE_OPTS);
    expect(errors.some((e) => e.property === 'bogus')).toBe(true);
  });

  it('limit сверх максимума отклоняется', async () => {
    const dto = plainToInstance(ProductCatalogQueryDto, { limit: '999' });
    const errors = await validate(dto, PIPE_OPTS);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});

describe('priceFrom в товаре', () => {
  it('принимает цену при создании', async () => {
    const dto = plainToInstance(CreateProductDto, {
      name: 'Цемент М400',
      priceFrom: 2450.5,
    });
    expect(await validate(dto, PIPE_OPTS)).toHaveLength(0);
  });

  it('null при обновлении снимает цену («по запросу»)', async () => {
    const dto = plainToInstance(UpdateProductDto, { priceFrom: null });
    expect(await validate(dto, PIPE_OPTS)).toHaveLength(0);
  });

  it('отрицательная цена и строка отклоняются', async () => {
    for (const priceFrom of [-1, '100']) {
      const dto = plainToInstance(UpdateProductDto, { priceFrom });
      const errors = await validate(dto, PIPE_OPTS);
      expect(errors.some((e) => e.property === 'priceFrom')).toBe(true);
    }
  });
});
