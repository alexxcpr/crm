import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('query parser', 'extended');

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  //CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true
  })
  
  await app.listen(process.env.PORT ?? 4000);
  console.log(`Listening on port ${process.env.PORT ?? 4000}`)
}
bootstrap();
