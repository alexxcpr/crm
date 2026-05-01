import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from './filters/http-exception.filter';

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  if (origin === process.env.FRONTEND_URL) {
    return true;
  }

  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.stanciulescu.xyz');
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('query parser', 'extended');

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
  })
  
  await app.listen(process.env.PORT ?? 4000);
  console.log(`Listening on port ${process.env.PORT ?? 4000}`)
}
bootstrap();
