import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PublicBrandingService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string) {
    // Intentionally public bootstrap lookup. It grants no authenticated tenant context.
    // Branding is loaded only through the identified clinic relation, never a caller clinicId.
    const clinic = await this.prisma.clinic.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: {
        slug: true,
        displayName: true,
        branding: {
          select: { logoUrl: true, primaryColor: true, secondaryColor: true, accentColor: true },
        },
      },
    });
    if (!clinic) throw new NotFoundException();
    // Explicit response projection is a second boundary if the database selection changes.
    return {
      slug: clinic.slug,
      displayName: clinic.displayName,
      branding: clinic.branding ? {
        logoUrl: clinic.branding.logoUrl,
        primaryColor: clinic.branding.primaryColor,
        secondaryColor: clinic.branding.secondaryColor,
        accentColor: clinic.branding.accentColor,
      } : null,
    };
  }
}
