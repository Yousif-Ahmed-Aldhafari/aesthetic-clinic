import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ClinicPermissions, type AuthRequest } from '../auth/access.js';
import { ClinicalPhotoRepository } from '../prisma/clinical-photo.repository.js';
import type { UploadedFilePayload } from './clinical-media-processing.service.js';
import {
  ArchivePhotoDto,
  CreatePhotoAnnotationDto,
  CreatePhotoComparisonDto,
  CreatePhotoSessionDto,
  UploadPhotoDto,
} from './clinical-photo-input.js';

@Controller('clinics/:clinicId/clinical')
export class ClinicalPhotoController {
  constructor(private readonly photos: ClinicalPhotoRepository) {}

  @Post('photo-sessions')
  @ClinicPermissions('clinical.photos.upload')
  createSession(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Body() body: CreatePhotoSessionDto,
  ) {
    return this.photos.createSession(r.auth!.principal, clinicId, body);
  }

  @Get('patients/:patientId/photo-sessions')
  @ClinicPermissions('clinical.photos.read')
  listSessions(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.photos.listSessions(r.auth!.principal, clinicId, patientId);
  }

  @Post('photo-sessions/:sessionId/photos')
  @ClinicPermissions('clinical.photos.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }))
  uploadPhoto(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: UploadedFilePayload | undefined,
    @Body() body: UploadPhotoDto,
  ) {
    return this.photos.uploadPhoto(r.auth!.principal, clinicId, sessionId, file, body);
  }

  @Get('photos/:photoId')
  @ClinicPermissions('clinical.photos.read')
  getPhotoMetadata(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.photos.getPhotoMetadata(r.auth!.principal, clinicId, photoId);
  }

  @Get('photos/:photoId/thumbnail')
  @ClinicPermissions('clinical.photos.read')
  async getPhotoThumbnail(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('photoId') photoId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const stream = await this.photos.getPhotoDecryptedStream(r.auth!.principal, clinicId, photoId, 'thumbnail');
    res.set({
      'Content-Type': stream.mimeType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'ETag': `"${stream.sha256Digest}"`,
    });
    return new StreamableFile(stream.buffer);
  }

  @Get('photos/:photoId/original')
  @ClinicPermissions('clinical.photos.read')
  async getPhotoOriginal(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('photoId') photoId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const stream = await this.photos.getPhotoDecryptedStream(r.auth!.principal, clinicId, photoId, 'original');
    res.set({
      'Content-Type': stream.mimeType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Content-Security-Policy': "default-src 'none'",
      'X-Content-Type-Options': 'nosniff',
      'ETag': `"${stream.sha256Digest}"`,
    });
    return new StreamableFile(stream.buffer);
  }

  @Post('patients/:patientId/photo-comparisons')
  @ClinicPermissions('clinical.photos.compare')
  createComparison(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
    @Body() body: CreatePhotoComparisonDto,
  ) {
    return this.photos.createComparison(r.auth!.principal, clinicId, patientId, body);
  }

  @Get('patients/:patientId/photo-comparisons')
  @ClinicPermissions('clinical.photos.read')
  listComparisons(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('patientId') patientId: string,
  ) {
    return this.photos.listComparisons(r.auth!.principal, clinicId, patientId);
  }

  @Post('photos/:photoId/annotations')
  @ClinicPermissions('clinical.photos.annotate')
  addAnnotation(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('photoId') photoId: string,
    @Body() body: CreatePhotoAnnotationDto,
  ) {
    return this.photos.addAnnotation(r.auth!.principal, clinicId, photoId, body);
  }

  @Get('photos/:photoId/annotations')
  @ClinicPermissions('clinical.photos.read')
  listAnnotations(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.photos.listAnnotations(r.auth!.principal, clinicId, photoId);
  }

  @Post('photos/:photoId/archive')
  @ClinicPermissions('clinical.photos.manage')
  archivePhoto(
    @Req() r: AuthRequest,
    @Param('clinicId') clinicId: string,
    @Param('photoId') photoId: string,
    @Body() body: ArchivePhotoDto,
  ) {
    return this.photos.archivePhoto(r.auth!.principal, clinicId, photoId, body);
  }
}

