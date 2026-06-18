import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from './filters/http-exception.filter';
import cookieParser from 'cookie-parser';

function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const required = [
    'JWT_SECRET',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'META_DB',
    'DOMAIN_BASE',
    'PROVISIONING_INTERNAL_SECRET',
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required production env vars: ${missing.join(', ')}`);
  }
}

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  if (origin === process.env.FRONTEND_URL) {
    return true;
  }

  try {
    const url = new URL(origin);
    const domainBase = process.env.DOMAIN_BASE || 'stanciulescu.xyz';

    if (url.protocol === 'https:' && url.hostname.endsWith(`.${domainBase}`)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function bootstrap() {
  validateProductionEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', 1);
  app.set('query parser', 'extended');

  app.use(cookieParser());

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  //CORS
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true
  });
  
  await app.listen(process.env.PORT ?? 4000);
  console.log(`Listening on port ${process.env.PORT ?? 4000}`);
}
bootstrap();
