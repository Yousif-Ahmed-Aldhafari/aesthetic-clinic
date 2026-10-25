import { createHash } from 'node:crypto';
import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PublicRoute } from '../auth/access.js';
import { ClinicSlugParams } from '../clinics/clinic-slug.params.js';
import { PublicQueueRepository } from '../prisma/public-queue.repository.js';
import { QueueStreams } from './queue-streams.js';
@Controller('public/clinics/:slug/queue')
@PublicRoute()
export class PublicQueueController {
  constructor(private readonly queue:PublicQueueRepository,private readonly streams:QueueStreams){}
  @Get() get(@Param() p:ClinicSlugParams){return this.queue.bySlug(p.slug);}
  @Get('events') events(@Req() r:Request,@Res() response:Response,@Param() p:ClinicSlugParams){return this.streams.open(r,response,async()=>{
    const publicSnapshot=await this.queue.bySlug(p.slug);
    return {revision:createHash('sha256').update(JSON.stringify(publicSnapshot)).digest('hex')};
  });}
}
