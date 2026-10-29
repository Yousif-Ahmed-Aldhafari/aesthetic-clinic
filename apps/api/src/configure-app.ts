import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from './audit/audit.service.js';
import { SafeExceptionFilter } from './common/safe-exception.filter.js';
import { ErrorTrackerService } from './observability/error-tracker.service.js';
import { StructuredLoggerService } from './observability/structured-logger.service.js';
import type { Environment } from './config/environment.js';
import cookieParser from 'cookie-parser';
import { json, type Request, type Response, type NextFunction } from 'express';
import { requestId as safeRequestId } from './observability/request-id.js';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<Environment, true>);
  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use(json({ limit: '16kb' }));
  app.getHttpAdapter().getInstance().set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }) || false);

  // Early Correlation & Request ID assignment
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = safeRequestId(request.headers['x-request-id']);
    const correlationId = safeRequestId(request.headers['x-correlation-id'], requestId);

    (request as unknown as { requestId: string; correlationId: string }).requestId = requestId;
    (request as unknown as { requestId: string; correlationId: string }).correlationId = correlationId;

    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Correlation-Id', correlationId);
    next();
  });
  app.use((_request: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';");
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      // Custom clinic domains may have unrelated subdomains; do not assert preload or
      // includeSubDomains until ownership and rollout are reviewed per hostname.
      response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  });
  // Hosts never supply tenant identity or absolute links. Ignore Forwarded-Host.
  app.use((request:Request,response:Response,next:NextFunction)=>{
    const host=request.headers.host;
    try{
      if(!host||/[\s/@#?\\]/.test(host))throw new Error();
      const parsed=new URL('http://'+host);
      const canonical=(value:string)=>value.toLowerCase().replace(/^\[|\]$/g,'');
      const hostname=canonical(parsed.hostname);
      const allowed=config.get('API_ALLOWED_HOSTS',{infer:true}).some(value=>{
        const expected=canonical(value);
        if(!expected.startsWith('*.'))return expected===hostname;
        const suffix=expected.slice(2);
        const prefix=hostname.slice(0,-suffix.length-1);
        return hostname.endsWith(`.${suffix}`)&&prefix.length>0&&!prefix.includes('.');
      });
      if(!allowed)throw new Error();
      next();
    }catch{response.status(400).json({statusCode:400,error:{code:'INVALID_REQUEST',message:'الطلب غير صالح'}});}
  });
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) =>
      callback(null, Boolean(origin && origins.includes(origin))),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token'],
    credentials: true,
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true,
    transform: true, validationError: { target: false, value: false },
  }));
  let auditService: AuditService | undefined;
  try { auditService = app.get(AuditService, { strict: false }); } catch {}
  let errorTracker: ErrorTrackerService | undefined;
  try { errorTracker = app.get(ErrorTrackerService, { strict: false }); } catch {}
  let loggerService: StructuredLoggerService | undefined;
  try { loggerService = app.get(StructuredLoggerService, { strict: false }); } catch {}
  app.useGlobalFilters(new SafeExceptionFilter(auditService, errorTracker, loggerService));
  app.getHttpAdapter().getInstance().disable('x-powered-by');
}
