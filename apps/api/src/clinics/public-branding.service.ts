import { Injectable } from '@nestjs/common';
import { PublicBrandingRepository } from '../prisma/public-branding.repository.js';
@Injectable()
export class PublicBrandingService {
  constructor(private readonly branding:PublicBrandingRepository) {}
  findBySlug(slug:string) { return this.branding.bySlug(slug); }
}
