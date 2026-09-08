import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `;

  const counts: Record<string, number> = {};
  for (const { tablename } of tables) {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT COUNT(*)::int AS n FROM "public"."${tablename}"`,
    );
    counts[tablename] = Number(rows[0]?.n ?? 0);
  }

  const users = await prisma.$queryRaw<
    Array<{ email: string; fullName: string; role: string }>
  >`SELECT email, "fullName", role FROM users ORDER BY "createdAt"`;

  const companies = await prisma.$queryRaw<
    Array<{
      name: string;
      city: string | null;
      bin: string | null;
      verified: boolean;
      rating: unknown;
      categories: string[];
      description: string | null;
    }>
  >`SELECT name, city, bin, verified, rating, categories, description FROM companies ORDER BY "createdAt"`;

  const products = await prisma.$queryRaw<
    Array<{
      name: string;
      city: string | null;
      unit: string | null;
      priceFrom: unknown;
      currency: string;
      isActive: boolean;
      company: string;
    }>
  >`
    SELECT p.name, p.city, p.unit, p."priceFrom", p.currency, p."isActive", c.name AS company
    FROM products p
    JOIN companies c ON c.id = p."companyId"
    ORDER BY p."createdAt"
  `;

  const requests = await prisma.$queryRaw<
    Array<{
      code: string;
      title: string;
      city: string | null;
      quantity: string | null;
      deadline: string | null;
      status: string;
    }>
  >`SELECT code, title, city, quantity, deadline, status FROM requests ORDER BY "createdAt"`;

  const offers = await prisma.$queryRaw<
    Array<{ price: unknown; currency: string; comment: string | null; status: string }>
  >`SELECT price, currency, comment, status FROM offers ORDER BY "createdAt"`;

  console.log(
    JSON.stringify(
      { tables: counts, users, companies, products, requests, offers },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
