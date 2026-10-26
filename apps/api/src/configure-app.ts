import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from './audit/audit.service.js';
import { SafeExceptionFilter } from './common/safe-exception.filter.js';
import type { Environment } from './config/environment.js';
import cookieParser from 'cookie-parser';
import { json, type Request, type Response, type NextFunction } from 'express';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<Environment, true>);
  const origins = config.get('CORS_ORIGINS', { infer: true });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.use(json({ limit: '16kb' }));
  app.getHttpAdapter().getInstance().set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }) || false);
  app.use((_request: unknown, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  // Hosts never supply tenant identity or absolute links. Ignore Forwarded-Host.
  app.use((request:Request,response:Response,next:NextFunction)=>{
    const host=request.headers.host;
    try{
      if(!host||/[\s/@#?\\]/.test(host))throw new Error();
      const parsed=new URL('http://'+host);
      const canonical=(value:string)=>value.toLowerCase().replace(/^\[|\]$/g,'');
      if(!config.get('API_ALLOWED_HOSTS',{infer:true}).some(value=>canonical(value)===canonical(parsed.hostname)))throw new Error();
      next();
    }catch{response.status(400).json({statusCode:400,error:{code:'INVALID_REQUEST',message:'الطلب غير صالح'}});}
  });
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allowed: boolean) => void) =>
      callback(null, Boolean(origin && origins.includes(origin))),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS'],
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
  app.useGlobalFilters(new SafeExceptionFilter(auditService));
  app.getHttpAdapter().getInstance().disable('x-powered-by');
}
