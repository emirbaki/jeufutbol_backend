import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { UploadTokenService } from './upload-token.service';

export interface UploadTokenRequest extends Request {
  uploadTenantId?: string;
}

/**
 * Checks the X-Upload-Token header for the uploadId in the route.
 * A guard runs before interceptors, so a caller with no valid token cannot make multer buffer a body.
 */
@Injectable()
export class UploadTokenGuard implements CanActivate {
  constructor(private readonly uploadTokens: UploadTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<UploadTokenRequest>();
    const header = req.headers['x-upload-token'];
    const token = Array.isArray(header) ? header[0] : header;
    const { tenantId } = this.uploadTokens.verify(token, req.params.uploadId);
    req.uploadTenantId = tenantId;
    return true;
  }
}
