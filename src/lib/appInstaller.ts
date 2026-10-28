import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system';
import appConfig from '../../app.json';
import { isReleaseUrl, type ReleaseAsset } from './appRelease';

type InstallerModule = {
  getAppInfo(): { version: string; versionCode: number; supportedAbis: string[] };
  verifyPackage(uri: string, sha256: string | null): Promise<void>;
  canInstallPackages(): boolean;
  openInstaller(uri: string): Promise<'permission' | 'opened'>;
};

const native = Platform.OS === 'android' ? requireOptionalNativeModule<InstallerModule>('AppInstaller') : null;
export const supportsAppInstallation = !!native;
// The dev server manifest can retain the version from before app.json was edited.
// Preview environments follow the bundled config; installed Android builds use
// PackageManager via the native module, so update checks use the actual binary.
const previewEnvironment = Platform.OS === 'web' || Constants.executionEnvironment === 'storeClient';
export const installedAppInfo = native?.getAppInfo() ?? {
  version: previewEnvironment ? appConfig.expo.version : Constants.expoConfig?.version ?? appConfig.expo.version,
  versionCode: 0, supportedAbis: [],
};

export function canInstallPackages() { return native?.canInstallPackages() ?? false; }
export async function openPackageInstaller(uri: string) {
  if (!native) throw new Error('请在 Android 安装版中使用自动安装功能。');
  return native.openInstaller(uri);
}

export async function removeUpdateFile(uri: string) {
  const directory = FileSystem.cacheDirectory && `${FileSystem.cacheDirectory}updates/`;
  if (directory && uri.startsWith(directory)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

export async function downloadAppUpdate(asset: ReleaseAsset, signal: AbortSignal, onProgress: (progress: number | null) => void, onVerify: () => void) {
  if (!native || !FileSystem.cacheDirectory) throw new Error('当前环境不支持下载并安装 APK。');
  if (!isReleaseUrl(asset.url, true) || !Number.isSafeInteger(asset.id) || asset.id <= 0 || !Number.isSafeInteger(asset.size) || asset.size <= 0) throw new Error('安装包下载信息无效。');
  const directory = `${FileSystem.cacheDirectory}updates/`;
  const uri = `${directory}drama-${asset.id}-${Date.now()}.apk`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  if (signal.aborted) throw new Error('下载已取消。');
  const task = FileSystem.createDownloadResumable(asset.url, uri, {}, event => {
    if (!signal.aborted) onProgress(event.totalBytesExpectedToWrite > 0
      ? Math.min(1, event.totalBytesWritten / event.totalBytesExpectedToWrite) : null);
  });
  const cancel = () => { void task.cancelAsync().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  // A stalled transfer should not leave the dialog busy indefinitely.
  const timeout = setTimeout(cancel, 10 * 60 * 1000);
  let succeeded = false;
  try {
    const result = await task.downloadAsync();
    if (signal.aborted) throw new Error('下载已取消。');
    if (!result || result.status !== 200) throw new Error('安装包下载失败，请检查网络后重试。');
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory || info.size !== asset.size) throw new Error('安装包下载不完整，请重新下载。');
    onVerify();
    await native.verifyPackage(uri, asset.sha256);
    if (signal.aborted) throw new Error('下载已取消。');
    succeeded = true;
    return uri;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    if (!succeeded) await removeUpdateFile(uri);
  }
}
