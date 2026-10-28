export const RELEASES_URL = 'https://github.com/tommycyl/Drama/releases';
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
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && !url.port
      && url.pathname.startsWith(`${REPOSITORY_PATH}${download ? 'download/' : 'tag/'}`);
  } catch { return false; }
}

function assetArchitecture(name: string): string | null {
  if (/arm64(?:-v8a)?|aarch64/i.test(name)) return 'arm64-v8a';
  if (/armeabi(?:-v7a)?|armv7/i.test(name)) return 'armeabi-v7a';
  if (/x86[_-]64|amd64/i.test(name)) return 'x86_64';
  if (/x86/i.test(name)) return 'x86';
  return null;
}

export function parseRelease(value: unknown, supportedAbis: string[] = []): AppRelease {
  if (!value || typeof value !== 'object') throw new Error('GitHub 返回的版本信息不完整。');
  const release = value as Record<string, unknown>;
  if (release.draft || release.prerelease || typeof release.tag_name !== 'string' || !isReleaseUrl(release.html_url)) {
    throw new Error('未找到可用的正式发布版本。');
  }
  versionParts(release.tag_name);
  const assets: ReleaseAsset[] = [];
  for (const raw of Array.isArray(release.assets) ? release.assets : []) {
    if (!raw || typeof raw !== 'object') continue;
    const asset = raw as Record<string, unknown>;
    if (typeof asset.name !== 'string' || !/\.apk$/i.test(asset.name) || !Number.isSafeInteger(asset.id) || (asset.id as number) <= 0
      || typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || !isReleaseUrl(asset.browser_download_url, true)
      || asset.state !== 'uploaded') continue;
    const digest = typeof asset.digest === 'string' && /^sha256:[a-f\d]{64}$/i.test(asset.digest)
      ? asset.digest.slice(7).toLowerCase() : null;
    assets.push({ id: asset.id as number, name: asset.name, size: asset.size, url: asset.browser_download_url, sha256: digest });
  }
  const universal = assets.filter(asset => /universal/i.test(asset.name) || !assetArchitecture(asset.name));
  const asset = universal.length === 1 ? universal[0]
    : supportedAbis.map(abi => assets.find(item => assetArchitecture(item.name) === abi)).find(Boolean) ?? null;
  return {
    version: release.tag_name.replace(/^v/i, ''),
    title: typeof release.name === 'string' ? release.name.slice(0, 160) : release.tag_name,
    notes: typeof release.body === 'string' ? release.body.slice(0, 4000) : '',
    url: release.html_url,
    asset,
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
