import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.JWT_SECRET ||= 'e2e-test-secret';
    process.env.DATABASE_URL ||=
      'postgresql://postgres:password@127.0.0.1:5432/huphup?schema=public';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live is public and does not need the database', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          status: 'ok',
          service: 'huphup-backend',
        });
      });
  });

  it('GET /users/me without a token is rejected', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });
});
