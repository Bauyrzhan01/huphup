import { PrismaClient, UserRole, CompanyMemberRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PASSWORD = 'TestPass123!';

const suppliers = [
  {
    email: 'supplier01@huphup.test',
    fullName: 'Айдар Цемент',
    company: 'Алматы Цемент Опт',
    city: 'Алматы',
    categories: ['Стройматериалы'],
    products: [
      {
        name: 'Цемент М400',
        description: 'Мешок 50 кг, оптом от 20 тонн',
        unit: 'т',
        priceFrom: 45000,
      },
      {
        name: 'Песок строительный',
        description: 'Карьерный песок с доставкой',
        unit: 'т',
        priceFrom: 8000,
      },
    ],
  },
  {
    email: 'supplier02@huphup.test',
    fullName: 'Данияр Мебель',
    company: 'Astana Office Furniture',
    city: 'Астана',
    categories: ['Мебель'],
    products: [
      {
        name: 'Офисный стол',
        description: 'Письменный стол 140 см, ЛДСП',
        unit: 'шт',
        priceFrom: 65000,
      },
      {
        name: 'Кресло руководителя',
        description: 'Эргономичное кресло с сеткой',
        unit: 'шт',
        priceFrom: 89000,
      },
    ],
  },
  {
    email: 'supplier03@huphup.test',
    fullName: 'Сауле Азық',
    company: 'FoodTrade Almaty',
    city: 'Алматы',
    categories: ['Продукты'],
    products: [
      {
        name: 'Рис круглозерный',
        description: 'Опт от 1 тонны, мешки 25 кг',
        unit: 'т',
        priceFrom: 320000,
      },
      {
        name: 'Подсолнечное масло',
        description: 'Бутылка 5л оптом',
        unit: 'шт',
        priceFrom: 3200,
      },
    ],
  },
  {
    email: 'supplier04@huphup.test',
    fullName: 'Ерлан Техно',
    company: 'TechSupply KZ',
    city: 'Алматы',
    categories: ['Электроника'],
    products: [
      {
        name: 'Ноутбук 15 дюйм',
        description: 'Бизнес ноутбуки оптом, i5/16GB',
        unit: 'шт',
        priceFrom: 280000,
      },
      {
        name: 'Монитор 27 дюйм',
        description: 'IPS монитор для офиса',
        unit: 'шт',
        priceFrom: 95000,
      },
    ],
  },
  {
    email: 'supplier05@huphup.test',
    fullName: 'Нұрлан Сантех',
    company: 'Shymkent Plumbing',
    city: 'Шымкент',
    categories: ['Сантехника'],
    products: [
      {
        name: 'Труба ППР 25мм',
        description: 'Полипропиленовые трубы для воды',
        unit: 'м',
        priceFrom: 450,
      },
      {
        name: 'Смеситель для раковины',
        description: 'Хром смеситель, гарантия 2 года',
        unit: 'шт',
        priceFrom: 18000,
      },
    ],
  },
  {
    email: 'supplier06@huphup.test',
    fullName: 'Айгүл Қаптама',
    company: 'PackPro Almaty',
    city: 'Алматы',
    categories: ['Упаковка'],
    products: [
      {
        name: 'Картонные коробки',
        description: 'Коробки 40x30x30, от 1000 шт',
        unit: 'шт',
        priceFrom: 180,
      },
      {
        name: 'Стрейч-пленка',
        description: 'Паллетная пленка 2.2кг',
        unit: 'шт',
        priceFrom: 4500,
      },
    ],
  },
  {
    email: 'supplier07@huphup.test',
    fullName: 'Жанар Текстиль',
    company: 'Textile Hub',
    city: 'Алматы',
    categories: ['Текстиль'],
    products: [
      {
        name: 'Спецодежда комплект',
        description: 'Рабочий костюм, размеры 48-56',
        unit: 'шт',
        priceFrom: 12000,
      },
      {
        name: 'Полотенца махровые',
        description: 'Опт для гостиниц',
        unit: 'шт',
        priceFrom: 1500,
      },
    ],
  },
  {
    email: 'supplier08@huphup.test',
    fullName: 'Бауржан Авто',
    company: 'AutoParts Astana',
    city: 'Астана',
    categories: ['Автозапчасти'],
    products: [
      {
        name: 'Масляный фильтр',
        description: 'Фильтры для легковых авто оптом',
        unit: 'шт',
        priceFrom: 2500,
      },
      {
        name: 'Тормозные колодки',
        description: 'Передние колодки, популярные модели',
        unit: 'комплект',
        priceFrom: 18000,
      },
    ],
  },
  {
    email: 'supplier09@huphup.test',
    fullName: 'Камила Клининг',
    company: 'CleanChem Almaty',
    city: 'Алматы',
    categories: ['Хозтовары'],
    products: [
      {
        name: 'Средство для полов',
        description: 'Профессиональная химия для клининга',
        unit: 'л',
        priceFrom: 1200,
      },
      {
        name: 'Перчатки нитриловые',
        description: 'Коробка 100 шт, размеры M/L',
        unit: 'кор',
        priceFrom: 3500,
      },
    ],
  },
  {
    email: 'supplier10@huphup.test',
    fullName: 'Тимур IT',
    company: 'ServerSoft Astana',
    city: 'Астана',
    categories: ['IT оборудование'],
    products: [
      {
        name: 'Сервер rack 1U',
        description: 'Сервер для малого офиса, Xeon',
        unit: 'шт',
        priceFrom: 950000,
      },
      {
        name: 'Сетевой коммутатор 24 порта',
        description: 'Gigabit switch managed',
        unit: 'шт',
        priceFrom: 120000,
      },
    ],
  },
];

async function upsertSupplier(entry: (typeof suppliers)[number], passwordHash: string) {
  const email = entry.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: entry.fullName,
        role: UserRole.SUPPLIER,
        phone: '+77001112200',
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        fullName: entry.fullName,
        role: UserRole.SUPPLIER,
        isActive: true,
      },
    });
  }

  await ensureWallet(user.id);

  let company = await prisma.company.findUnique({ where: { ownerId: user.id } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        ownerId: user.id,
        name: entry.company,
        city: entry.city,
        description: `Тестовый поставщик: ${entry.company}`,
        categories: entry.categories,
        verified: true,
        rating: 4.5,
        members: {
          create: {
            userId: user.id,
            role: CompanyMemberRole.OWNER,
            title: 'Владелец',
          },
        },
      },
    });
  } else {
    company = await prisma.company.update({
      where: { id: company.id },
      data: {
        name: entry.company,
        city: entry.city,
        categories: entry.categories,
        verified: true,
        rating: 4.5,
      },
    });
    await prisma.companyMember.upsert({
      where: { userId: user.id },
      create: {
        companyId: company.id,
        userId: user.id,
        role: CompanyMemberRole.OWNER,
        title: 'Владелец',
      },
      update: { role: CompanyMemberRole.OWNER },
    });
  }

  for (const p of entry.products) {
    const existing = await prisma.product.findFirst({
      where: { companyId: company.id, name: p.name },
    });
    if (existing) {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          description: p.description,
          unit: p.unit,
          priceFrom: p.priceFrom,
          currency: 'KZT',
          city: entry.city,
          isActive: true,
        },
      });
    } else {
      await prisma.product.create({
        data: {
          companyId: company.id,
          name: p.name,
          description: p.description,
          unit: p.unit,
          priceFrom: p.priceFrom,
          currency: 'KZT',
          city: entry.city,
          isActive: true,
        },
      });
    }
  }

  return { email, company: entry.company };
}

async function ensureWallet(userId: string) {
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

async function upsertAdmin(passwordHash: string) {
  const email = 'admin@huphup.test';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: 'Тест Админ',
        role: UserRole.ADMIN,
        phone: '+77000000000',
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        role: UserRole.ADMIN,
        fullName: 'Тест Админ',
        isActive: true,
      },
    });
  }
  await ensureWallet(user.id);
  return user;
}

async function upsertBuyer(passwordHash: string, adminId: string) {
  const email = 'buyer@huphup.test';
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: 'Тест Заказчик',
        role: UserRole.BUYER,
        phone: '+77009998877',
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        role: UserRole.BUYER,
        fullName: 'Тест Заказчик',
        isActive: true,
      },
    });
  }

  const wallet = await ensureWallet(user.id);
  const txCount = await prisma.walletTransaction.count({
    where: { walletId: wallet.id },
  });
  if (txCount === 0) {
    await prisma.$transaction([
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: 50000 },
      }),
      prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'CREDIT',
          amount: 50000,
          balanceAfter: 50000,
          comment: 'Seed top-up',
          createdById: adminId,
        },
      }),
    ]);
  }

  return email;
}

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const admin = await upsertAdmin(passwordHash);
  const buyerEmail = await upsertBuyer(passwordHash, admin.id);
  const created = [];
  for (const s of suppliers) {
    created.push(await upsertSupplier(s, passwordHash));
  }

  console.log('Seed OK');
  console.log(`Admin:  ${admin.email} / ${PASSWORD}`);
  console.log(`Buyer:  ${buyerEmail} / ${PASSWORD} (wallet 50000 KZT)`);
  console.log('Suppliers (all password same):');
  for (const c of created) {
    console.log(`  ${c.email} — ${c.company}`);
  }
  console.log(`Password: ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
