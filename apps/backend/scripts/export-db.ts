import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const outDir = join(process.cwd(), 'exports');

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}

function save(name: string, rows: unknown[]) {
  const list = rows as Record<string, unknown>[];
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(list, null, 2), 'utf8');
  writeFileSync(join(outDir, `${name}.csv`), toCsv(list), 'utf8');
  return list.length;
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  const [
    users,
    companies,
    products,
    images,
    reviews,
    members,
    requests,
    offers,
    leads,
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    }),
    prisma.company.findMany(),
    prisma.product.findMany(),
    prisma.productImage.findMany({
      select: { id: true, productId: true, url: true, sortOrder: true, createdAt: true },
    }),
    prisma.productReview.findMany(),
    prisma.companyMember.findMany(),
    prisma.request.findMany(),
    prisma.offer.findMany(),
    prisma.lead.findMany(),
  ]);

  const counts = {
    users: save('users', users),
    companies: save('companies', companies),
    products: save('products', products),
    product_images: save('product_images', images),
    product_reviews: save('product_reviews', reviews),
    company_members: save('company_members', members),
    requests: save('requests', requests),
    offers: save('offers', offers),
    leads: save('leads', leads),
  };

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(counts, null, 2), 'utf8');
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
