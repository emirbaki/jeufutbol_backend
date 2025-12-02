import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
// import * as path from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: process.env['UPLOAD_DIR'],
      serveRoot: '/uploads', // URL prefix
      exclude: ['/api/{*test}'], // API route’ları ile çakışmasın
      serveStaticOptions: {
        fallthrough: false,
        setHeaders: (res) => {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Origin', '*');
        },
      },
    }),
  ],
})
export class StaticFilesModule {}
