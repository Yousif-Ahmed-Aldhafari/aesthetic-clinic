import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export interface ProcessedClinicalMedia {
  canonicalBytes: Buffer;
  thumbnailBytes: Buffer;
  width: number;
  height: number;
  mimeType: 'image/webp';
  byteSize: number;
  sha256Digest: string;
}

export interface UploadedFilePayload {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MiB limit

@Injectable()
export class ClinicalMediaProcessingService {
  async processAndNormalizeImage(file: UploadedFilePayload | undefined): Promise<ProcessedClinicalMedia> {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new BadRequestException('No image file payload provided');
    }

    if (file.buffer.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Image file exceeds maximum allowable upload size of 15 MiB');
    }

    const b = file.buffer;

    // Strict Magic Byte verification
    const isPng = b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const isWebp =
      b.length >= 12 &&
      b.subarray(0, 4).toString('ascii') === 'RIFF' &&
      b.subarray(8, 12).toString('ascii') === 'WEBP';

    if (!isPng && !isJpeg && !isWebp) {
      throw new BadRequestException('Unsupported image file format. Only JPEG, PNG, and WebP images are permitted');
    }

    const detectedFormat = isPng ? 'png' : isJpeg ? 'jpeg' : 'webp';

    // Verify declared MIME if provided
    if (file.mimetype) {
      const allowedMimes: Record<string, string> = {
        png: 'image/png',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
      };
      if (file.mimetype !== allowedMimes[detectedFormat]) {
        throw new BadRequestException('MIME type mismatch with binary image signature');
      }
    }

    try {
      // Decode with decompression bomb protections (max 4096 * 4096 = 16.7 Mpixels)
      const image = sharp(b, {
        limitInputPixels: 4096 * 4096,
        failOn: 'warning',
        animated: false,
      });

      const meta = await image.metadata();
      if (
        meta.format !== detectedFormat ||
        !meta.width ||
        !meta.height ||
        meta.width < 32 ||
        meta.height < 32 ||
        meta.width > 4096 ||
        meta.height > 4096 ||
        (meta.pages ?? 1) > 1
      ) {
        throw new Error('Image dimensions outside clinical bounds [32..4096] or multi-page animation detected');
      }

      // Canonical Clinical Master: auto-rotate for orientation, resize within 2560px, convert to WebP,
      // and STRIP EXIF/GPS/device metadata by omitting .withMetadata()
      const canonicalPipeline = sharp(b, { limitInputPixels: 4096 * 4096, animated: false })
        .rotate()
        .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 });

      const { data: canonicalBytes, info: canonicalInfo } = await canonicalPipeline.toBuffer({
        resolveWithObject: true,
      });

      // Thumbnail: 320x320 bounding box WebP
      const thumbnailPipeline = sharp(canonicalBytes, { limitInputPixels: 4096 * 4096, animated: false })
        .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 });

      const thumbnailBytes = await thumbnailPipeline.toBuffer();

      const sha256Digest = createHash('sha256').update(canonicalBytes).digest('hex');

      return {
        canonicalBytes,
        thumbnailBytes,
        width: canonicalInfo.width,
        height: canonicalInfo.height,
        mimeType: 'image/webp',
        byteSize: canonicalBytes.length,
        sha256Digest,
      };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? `Image validation or normalization failed: ${err.message}` : 'Image processing failed',
      );
    }
  }
}

