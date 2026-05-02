import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as path from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: process.env['UPLOAD_DIR'],
      serveRoot: '/uploads', // URL prefix
      exclude: ['/api/{*test}'], // API route’ları ile çakışmasın
      serveStaticOptions: {
        fallthrough: false,
        setHeaders: (res, filePath) => {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Origin', '*');

          // Fix Content-Type for video files (default returns application/mp4 instead of video/mp4)
          const ext = path.extname(filePath).toLowerCase();
          const videoMimeTypes: Record<string, string> = {
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.webm': 'video/webm',
            '.mkv': 'video/x-matroska',
          };
          if (videoMimeTypes[ext]) {
            res.setHeader('Content-Type', videoMimeTypes[ext]);
          }
        },
      },
    }),
  ],
})
export class StaticFilesModule {}
