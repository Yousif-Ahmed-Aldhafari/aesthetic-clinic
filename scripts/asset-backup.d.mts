export function runAssetBackup(options?: { source?: string; outdir?: string; key?: string; retentionDays?: number }): {
  archivePath: string; metaPath: string; fileCount: number; totalBytes: number; pruned: number;
};
