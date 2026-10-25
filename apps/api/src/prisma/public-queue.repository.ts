import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { PublicBrandingRepository } from './public-branding.repository.js';
@Injectable()
export class PublicQueueRepository {
  constructor(private readonly prisma:PrismaService,private readonly branding:PublicBrandingRepository){}
  async bySlug(slug:string){
    const rows=await this.prisma.$queryRaw<{displayName:string;timezone:string;businessDate:string|null;number:number|null;status:string|null;doctorLabel:string|null;roomLabel:string|null;calledAt:Date|null;recallCount:number|null}[]>`SELECT * FROM lamssa_security.public_queue(${slug})`;
    if(!rows.length)throw new NotFoundException();
    // Never join or select Patient, Visit, Appointment or global identity here.
    const branding=await this.branding.bySlug(slug);
    return {clinic:branding,timezone:rows[0].timezone,items:rows.filter(r=>r.number!==null).map(r=>({
      ticketNumber:`Q-${String(r.number).padStart(4,'0')}`,businessDate:r.businessDate,status:r.status,
      doctorLabel:r.doctorLabel,roomLabel:r.roomLabel,calledAt:r.calledAt?.toISOString()??null,recallCount:r.recallCount,
    }))};
  }
}
