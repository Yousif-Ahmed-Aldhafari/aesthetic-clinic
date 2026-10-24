import { Controller, Get, Header, Param } from '@nestjs/common';
import { ClinicSlugParams } from './clinic-slug.params.js';
import { PublicBrandingService } from './public-branding.service.js';
import { PublicRoute } from '../auth/access.js';

@Controller('public/clinics')
@PublicRoute()
export class PublicBrandingController {
  constructor(private readonly branding: PublicBrandingService) {}

  @Get(':slug/branding')
  @Header('Cache-Control', 'no-store')
  get(@Param() params: ClinicSlugParams) {
    return this.branding.findBySlug(params.slug);
  }
}
