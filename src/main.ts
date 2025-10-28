import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
// import * as fs from 'fs';

async function bootstrap() {
  // const httpsOptions = {
  //   key: fs.readFileSync('./cert/key.pem'),
  //   cert: fs.readFileSync('./cert/cert.pem'),
  // };

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: ['http://localhost:4200', 'https://jeufutbol.com.tr'],
    credentials: true,
  });
  app.useStaticAssets('var/www/uploads', { prefix: '/uploads/' ,

    setHeaders: (res, path, stat) => {
      // res is the Express Response object
      // path is the full file system path of the static file being served

      // IMPORTANT: Use console.log or a dedicated logger here, 
      // as Nest's Logger might not be fully initialized in main.ts
      console.log(`
      ✅ Static File Served: ${path}
      Request URL: ${res.req.url}
      Client IP: ${res.req.ip}
      File Size: ${stat.size} bytes
      `);
      // Optionally, you can set custom headers here if needed
      // res.set('X-Static-Logged', 'true');
    },
  });
  app.setGlobalPrefix('api');
  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;

  await app.listen(port);

  console.log(`🚀 Application is running on: https://localhost:${port}`);
  console.log(`📊 GraphQL Playground: https://localhost:${port}/graphql`);
}

bootstrap();
