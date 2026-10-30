import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants } from 'node:fs';
import { lstat, mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Environment } from '../config/environment.js';

export abstract class ClinicalMediaStore {
  abstract put(key: string, bytes: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
}

@Injectable()
export class LocalClinicalMediaStore extends ClinicalMediaStore {
  constructor(private readonly config: ConfigService<Environment, true>) {
    super();
  }

  private async path(key: string, create = false): Promise<string> {
    // Key format: <clinicId>/<photoId>.enc or <clinicId>/<photoId>.thumb.enc
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:\.thumb)?\.enc$/i.test(key)) {
      throw new NotFoundException('Invalid storage key specification');
    }

    const configured = this.config.get('ASSET_STORAGE_DIR', { infer: true });
    if (this.config.get('NODE_ENV', { infer: true }) === 'production' && !configured) {
      throw new ServiceUnavailableException('ASSET_STORAGE_DIR required in production');
    }

    const root = configured ?? resolve(import.meta.dirname, '../../../../var/clinic-assets');
    const file = resolve(root, key);
    const folder = dirname(file);

    if (create) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await mkdir(folder, { recursive: true, mode: 0o700 });
    }

    const rootStat = await lstat(root).catch(() => null);
    const folderStat = await lstat(folder).catch(() => null);
    if ((rootStat && rootStat.isSymbolicLink()) || (folderStat && folderStat.isSymbolicLink())) {
      throw new ServiceUnavailableException('Storage root cannot be a symbolic link');
    }

    return file;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const filePath = await this.path(key, true);
    const file = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await file.writeFile(bytes);
    } finally {
      await file.close();
    }
  }

  async read(key: string): Promise<Buffer> {
    try {
      const filePath = await this.path(key, false);
      const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        return await file.readFile();
      } finally {
        await file.close();
      }
    } catch {
      throw new NotFoundException('Requested clinical media file not found');
    }
  }

  async remove(key: string): Promise<void> {
    try {
      const filePath = await this.path(key, false);
      await unlink(filePath);
    } catch (e) {
      if ((e as { code?: string }).code !== 'ENOENT') throw e;
    }
  }
}

