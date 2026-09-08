import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';
import { isOriginAllowed, parseCorsOrigins } from './common/cors';
import { RedisIoAdapter } from './common/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const redisUrl = config.get<string>('REDIS_URL')?.trim();
  if (redisUrl) {
    const redisAdapter = new RedisIoAdapter(app);
    const connected = await redisAdapter.connect(redisUrl);
    app.useWebSocketAdapter(connected ? redisAdapter : new IoAdapter(app));
  } else {
    app.useWebSocketAdapter(new IoAdapter(app));
  }

  const prefix = config.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(prefix);

  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = parseCorsOrigins(config.get<string>('CORS_ORIGINS'));

  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin, origins));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-monitor-secret'],
  });

  const swagger = new DocumentBuilder()
    .setTitle('HupHup API')
    .setDescription(
      'B2B marketplace backend for requests, offers, leads and chat',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document);

  const port = Number(config.get('PORT') ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`HupHup API http://0.0.0.0:${port}/${prefix}`);
  console.log(`Swagger     http://0.0.0.0:${port}/docs`);
}

void bootstrap();
