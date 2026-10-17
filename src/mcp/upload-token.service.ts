import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';

const DEFAULT_TTL_SECONDS = 3600;
const INVALID = 'Upload token is not valid. Call create_upload again.';
const EXPIRED = 'Upload token expired. Call create_upload again.';

interface UploadTokenPayload {
  type: 'upload';
  uploadId: string;
  tenantId: string;
}

/**
 * Short-lived token for one chunked upload. It goes into shell commands instead of the API key.
 * CombinedAuthGuard and JwtStrategy reject it as a login.
 */
@Injectable()
export class UploadTokenService {
  constructor(private readonly jwtService: JwtService) {}

  sign(uploadId: string, tenantId: string): { token: string; expiresAt: Date } {
    const ttl = this.ttlSeconds();
    const payload: UploadTokenPayload = { type: 'upload', uploadId, tenantId };
    const token = this.jwtService.sign(payload, { expiresIn: ttl });
    return { token, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  verify(token: string | undefined, uploadId: string): { tenantId: string } {
    if (!token) {
      throw new UnauthorizedException(INVALID);
    }
    let payload: Partial<UploadTokenPayload>;
    try {
      payload = this.jwtService.verify(token);
    } catch (err) {
      throw new UnauthorizedException(err instanceof TokenExpiredError ? EXPIRED : INVALID);
    }
    if (payload.type !== 'upload' || payload.uploadId !== uploadId || !payload.tenantId) {
      throw new UnauthorizedException(INVALID);
    }
    return { tenantId: payload.tenantId };
  }

  private ttlSeconds(): number {
    const ttl = Number(process.env.MCP_UPLOAD_TOKEN_TTL);
    return Number.isInteger(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_SECONDS;
  }
}
