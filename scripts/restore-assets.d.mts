export function runAssetRestore(options?: { metaPath?: string; target?: string; key?: string; drill?: boolean }): {
  mode: 'verification' | 'restore'; target?: string; fileCount: number; totalBytes: number;
};
