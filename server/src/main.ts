import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { GlobalExceptionFilter } from './filters/http-exception.filter';

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
    origin: process.env.FRONTEND_URL,
    credentials: true
  })
  
  await app.listen(process.env.PORT ?? 4000);
  console.log(`Listening on port ${process.env.PORT ?? 4000}`)
}
bootstrap();
