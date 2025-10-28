// src/static-files/static-files.module.ts
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
// import * as path from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: process.env['UPLOAD_DIR'],
      serveRoot: '/uploads', // URL prefix
      exclude: ['/api*'], // API route’ları ile çakışmasın
    }),
  ],
})
export class StaticFilesModule {}
