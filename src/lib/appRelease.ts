export const RELEASES_URL = 'https://github.com/tommycyl/Drama/releases';
export const APK_DOWNLOAD_BASE_URL = 'https://pic.tommy.xx.kg';
const REPOSITORY_PATH = '/tommycyl/Drama/releases/';
const LATEST_RELEASE_API = 'https://api.github.com/repos/tommycyl/Drama/releases/latest';

export type ReleaseAsset = { id: number; name: string; size: number; url: string; sha256: string | null };
export type AppRelease = { version: string; title: string; notes: string; url: string; asset: ReleaseAsset | null };

function versionParts(value: string) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\+[\w.-]+)?$/i.exec(value.trim());
  if (!match) throw new Error('无法识别版本号，请在 GitHub 发布正式版本（例如 v1.2.0）。');
  const parts = match.slice(1, 4).map(part => Number(part ?? '0'));
  if (!parts.every(Number.isSafeInteger)) throw new Error('版本号超出支持范围。');
  return parts;
}

export function buildApkDownloadUrl(version: string): string {
  const normalized = version.trim().replace(/^v/i, '');
  versionParts(normalized);
  return `${APK_DOWNLOAD_BASE_URL}/v${normalized}.apk`;
}

export function isNewerVersion(candidate: string, installed: string): boolean {
  const next = versionParts(candidate), current = versionParts(installed);
  for (let index = 0; index < 3; index++) {
    if (next[index] !== current[index]) return next[index] > current[index];
  }
  return false;
}

export function isReleaseUrl(value: unknown, download = false): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (download) {
      return url.protocol === 'https:' && url.hostname === 'pic.tommy.xx.kg' && !url.username && !url.password && !url.port
        && /^\/v\d+(?:\.\d+){0,2}(?:\+[\w.-]+)?\.apk$/i.test(url.pathname);
    }
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.port
      && url.pathname.startsWith(`${REPOSITORY_PATH}tag/`);
  } catch { return false; }
}

export function parseRelease(value: unknown, _supportedAbis: string[] = []): AppRelease {
  if (!value || typeof value !== 'object') throw new Error('GitHub 返回的版本信息不完整。');
  const release = value as Record<string, unknown>;
  if (release.draft || release.prerelease || typeof release.tag_name !== 'string' || !isReleaseUrl(release.html_url)) {
    throw new Error('未找到可用的正式发布版本。');
  }
  const parts = versionParts(release.tag_name);
  const version = release.tag_name.trim().replace(/^v/i, '');
  const apkName = `v${version}.apk`;
  const downloadUrl = buildApkDownloadUrl(version);
  const assetId = Math.max(1, parts[0] * 1_000_000 + parts[1] * 1_000 + parts[2]);
  return {
    version,
    title: typeof release.name === 'string' && release.name.trim() ? release.name.slice(0, 160) : `v${version}`,
    notes: typeof release.body === 'string' ? release.body.slice(0, 4000) : '',
    url: downloadUrl,
    asset: {
      id: assetId,
      name: apkName,
      size: 0,
      url: downloadUrl,
      sha256: null,
    },
  };
}

export async function fetchLatestRelease(signal: AbortSignal, supportedAbis: string[] = []): Promise<AppRelease | null> {
  let response: Response;
  try {
    response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store', signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('无法连接 GitHub，请检查网络后重试。');
  }
  if (response.status === 404) return null;
  if (response.status === 403 || response.status === 429) throw new Error('GitHub 请求暂时受限，请稍后再试。');
  if (!response.ok) throw new Error('无法连接 GitHub 检查更新，请稍后重试。');
  return parseRelease(await response.json(), supportedAbis);
}
