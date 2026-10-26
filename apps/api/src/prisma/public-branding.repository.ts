import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
@Injectable()
export class PublicBrandingRepository {
  constructor(private readonly prisma:PrismaService) {}
  async bySlug(slug:string) {
    const [row]=await this.prisma.$queryRaw<{slug:string;displayName:string;hasBranding:boolean;logoUrl:string|null;primaryColor:string;secondaryColor:string;accentColor:string|null;faviconUrl:string|null;typography:string}[]>`
      SELECT * FROM lamssa_security.public_branding_details(${slug})`;
    if(!row)throw new NotFoundException();
    return {slug:row.slug,displayName:row.displayName,branding:row.hasBranding?{logoUrl:row.logoUrl,primaryColor:row.primaryColor,secondaryColor:row.secondaryColor,accentColor:row.accentColor,faviconUrl:row.faviconUrl,typography:row.typography}:null};
  }
  async asset(id:string){
    const [row]=await this.prisma.$queryRaw<{storageKey:string;mimeType:string;byteSize:number;sha256:string}[]>`SELECT * FROM lamssa_security.public_brand_asset(${id}::uuid)`;
    if(!row)throw new NotFoundException();return row;
  }
}
