import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductCatalogQueryDto } from './product.dto';

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
