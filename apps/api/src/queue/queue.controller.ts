import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { QueueRepository } from '../prisma/queue.repository.js';
import { CallNextInput, CheckInInput, QueueActionInput, QueueConfigurationInput, QueueQuery, QueueRoute, TransferInput, WalkInInput } from './queue-input.js';
import { QueueStreams } from './queue-streams.js';
@Controller('clinics/:clinicId/queue')
export class QueueController {
  constructor(private readonly queue:QueueRepository,private readonly streams:QueueStreams){}
  @Get() @ClinicPermissions('queue.read') list(@Req() r:AuthRequest,@Param('clinicId') id:string,@Query() q:QueueQuery){return this.queue.list(r.auth!.principal,id,q);}
  @Get('resources') @ClinicPermissions('queue.read') resources(@Req() r:AuthRequest,@Param('clinicId') id:string){return this.queue.resources(r.auth!.principal,id);}
  @Get('events') @ClinicPermissions('queue.read') events(@Req() r:AuthRequest,@Res() response:Response,@Param('clinicId') id:string){return this.streams.open(r,response,()=>this.queue.revision(r.auth!.principal,id));}
  @Post('check-in') @ClinicPermissions('queue.checkin') checkIn(@Req() r:AuthRequest,@Param('clinicId') id:string,@Body() b:CheckInInput){return this.queue.checkIn(r.auth!.principal,id,b);}
  @Post('reconcile') @ClinicPermissions('queue.checkin') reconcile(@Req() r:AuthRequest,@Param('clinicId') id:string,@Body() b:CheckInInput){return this.queue.checkIn(r.auth!.principal,id,b,true);}
  @Post('walk-ins') @ClinicPermissions('queue.checkin') walkIn(@Req() r:AuthRequest,@Param('clinicId') id:string,@Body() b:WalkInInput){return this.queue.walkIn(r.auth!.principal,id,b);}
  @Post('call-next') @ClinicPermissions('queue.manage') callNext(@Req() r:AuthRequest,@Param('clinicId') id:string,@Body() b:CallNextInput){return this.queue.callNext(r.auth!.principal,id,b);}
  @Patch('tickets/:ticketId') @ClinicPermissions('queue.manage') action(@Req() r:AuthRequest,@Param() p:QueueRoute,@Body() b:QueueActionInput){return this.queue.action(r.auth!.principal,p.clinicId,p.ticketId,b);}
  @Patch('tickets/:ticketId/transfer') @ClinicPermissions('queue.transfer') transfer(@Req() r:AuthRequest,@Param() p:QueueRoute,@Body() b:TransferInput){return this.queue.transfer(r.auth!.principal,p.clinicId,p.ticketId,b);}
  @Patch('configuration') @ClinicPermissions('clinic.settings.update') configure(@Req() r:AuthRequest,@Param('clinicId') id:string,@Body() b:QueueConfigurationInput){return this.queue.configure(r.auth!.principal,id,b);}
}
