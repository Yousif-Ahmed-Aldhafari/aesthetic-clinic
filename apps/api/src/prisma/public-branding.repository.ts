import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
@Injectable()
export class PublicBrandingRepository {
  constructor(private readonly prisma:PrismaService) {}
  async bySlug(slug:string) {
    const [row]=await this.prisma.$queryRaw<{slug:string;displayName:string;hasBranding:boolean;logoUrl:string|null;primaryColor:string;secondaryColor:string;accentColor:string|null}[]>`
      SELECT * FROM lamssa_security.public_branding(${slug})`;
    if(!row)throw new NotFoundException();
    return {slug:row.slug,displayName:row.displayName,branding:row.hasBranding?{logoUrl:row.logoUrl,primaryColor:row.primaryColor,secondaryColor:row.secondaryColor,accentColor:row.accentColor}:null};
  }
}
