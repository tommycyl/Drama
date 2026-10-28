import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchLatestRelease, isNewerVersion, type AppRelease } from '../lib/appRelease';
import { canInstallPackages, downloadAppUpdate, installedAppInfo, openPackageInstaller, removeUpdateFile } from '../lib/appInstaller';

export type UpdatePhase = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'verifying' | 'permission' | 'downloaded' | 'opened' | 'error';

export function useAppUpdate() {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [message, setMessage] = useState('');
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const openingInstaller = useRef(false);
  const packageFile = useRef<{ uri: string; assetId: number } | null>(null);
  const autoInstall = useRef(false);
  const awaitingPermission = useRef(false);
  const resumeInstall = useRef<() => void>(() => {});
  const isCurrent = (id: number) => mounted.current && generation.current === id;

  function cancel() {
    generation.current++;
    request.current?.abort();
    request.current = null;
    autoInstall.current = false;
    awaitingPermission.current = false;
    busy.current = false;
    if (mounted.current) { setPhase('idle'); setMessage(''); setProgress(null); }
  }

  async function install() {
    const file = packageFile.current;
    if (!file || openingInstaller.current || !mounted.current) return;
    const id = generation.current;
    openingInstaller.current = true;
    autoInstall.current = true;
    try {
      const result = await openPackageInstaller(file.uri);
      if (!isCurrent(id)) return;
      setPhase(result === 'permission' ? 'permission' : 'opened');
      setMessage(result === 'permission'
        ? '请在系统设置中允许此应用安装更新，返回后会自动打开安装界面。'
        : '已打开系统安装界面，请按提示完成安装。');
      autoInstall.current = result === 'permission';
      awaitingPermission.current = result === 'permission';
    } catch (error) {
      if (!isCurrent(id)) return;
      autoInstall.current = false;
      packageFile.current = null;
      setPhase('error');
      setMessage(error instanceof Error ? error.message : '无法打开安装界面，请重新下载。');
    } finally { openingInstaller.current = false; }
  }

  resumeInstall.current = () => {
    if (autoInstall.current && packageFile.current && (!awaitingPermission.current || canInstallPackages())) void install();
  };

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') resumeInstall.current();
    });
    return () => {
      mounted.current = false;
      generation.current++;
      request.current?.abort();
      autoInstall.current = false;
      subscription.remove();
    };
  }, []);

  async function check(): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    const id = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    autoInstall.current = false;
    setPhase('checking'); setMessage('正在连接 GitHub…');
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    try {
      const latest = await fetchLatestRelease(controller.signal, installedAppInfo.supportedAbis);
      if (!isCurrent(id) || controller.signal.aborted) return false;
      if (!latest) {
        setPhase('idle'); setMessage('GitHub 暂无正式发布版本。'); return false;
      }
      if (!isNewerVersion(latest.version, installedAppInfo.version)) {
        setPhase('latest'); setMessage(`已经是最新版本（${installedAppInfo.version}）`); return false;
      }
      setRelease(latest); setProgress(null); setMessage(''); setPhase('available');
      return true;
    } catch (error) {
      if (isCurrent(id)) {
        setPhase('error');
        setMessage(timedOut ? '检查更新超时，请检查网络后重试。' : error instanceof Error ? error.message : '检查更新失败，请稍后重试。');
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (isCurrent(id)) { busy.current = false; request.current = null; }
    }
  }

  async function download() {
    const asset = release?.asset;
    if (!asset || busy.current || openingInstaller.current) return;
    if (packageFile.current?.assetId === asset.id) { await install(); return; }
    busy.current = true;
    const id = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    setPhase('downloading'); setMessage('正在下载 APK…'); setProgress(0);
    try {
      const uri = await downloadAppUpdate(asset, controller.signal,
        next => { if (isCurrent(id)) setProgress(next); },
        () => { if (isCurrent(id)) { setPhase('verifying'); setMessage('下载完成，正在校验安装包…'); } });
      if (!isCurrent(id)) { await removeUpdateFile(uri); return; }
      packageFile.current = { uri, assetId: asset.id };
      awaitingPermission.current = false;
      autoInstall.current = true;
      setPhase('downloaded'); setMessage('下载完成，返回应用后将打开系统安装界面。');
      if (AppState.currentState === 'active') await install();
    } catch (error) {
      if (isCurrent(id)) {
        setPhase('error'); setMessage(error instanceof Error ? error.message : '下载失败，请重试。');
      }
    } finally {
      if (isCurrent(id)) { busy.current = false; request.current = null; }
    }
  }

  return { phase, message, release, progress, currentVersion: installedAppInfo.version, check, download, install, cancel };
}
