import { useEffect, useRef, useState } from 'react';
import { AppState, Dimensions, Platform } from 'react-native';
import type { CameraView } from 'expo-camera';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { getActiveAIConfig } from '../lib/aiConfig';
import { validateAIProfile } from '../lib/aiClient';
import { analyzeCameraSample } from '../lib/aiGuidance';
import { captureAnalysisSample, prepareCapturedPhoto, removeSampleFile } from '../lib/cameraSample';
import { GuidanceLoop } from '../lib/guidanceLoop';
import { CameraShotQueue } from '../lib/guidanceRules';
import { GuidanceExecution, type ExecutionPhase } from '../lib/guidanceExecution';
import type { CompositionTarget } from '../lib/compositionTarget';
import { digitalZoomFactor } from '../lib/cameraGeometry';
import { GUIDANCE_SETTLE_MS } from '../constants/guidance';
import { SYSTEM_CAMERA_CAPABILITIES } from '../constants/cameraCapabilities';
import { applyCameraTuning, needsCameraTuning, readCameraCapabilities, resetCameraTuning, styleTuning, validateCameraTuning } from '../lib/cameraTuning';
import type { CameraCapabilities, CameraMode, CameraStyle, Guidance, GuidanceConfig, GuidanceContext, GuidanceResult, GuidanceStatus, WhiteBalance } from '../types/guidance';

type AppliedTuning = { aperture: number | null; whiteBalance: WhiteBalance | 'keep'; contrast: number | null };
export type ManualCameraSettings = Partial<AppliedTuning> & { zoom?: number; flash?: GuidanceContext['flash'] };

export function useCameraGuidance(cameraRef: React.RefObject<CameraView>, onCapture: (uri: string) => void, viewfinderAspect = 3 / 4) {
  const aspectRef = useRef(viewfinderAspect);
  const [context, setContext] = useState<GuidanceContext>({ style: '清透', mode: '人像', facing: 'back', zoom: 0, flash: 'off' });
  const contextRef = useRef(context);
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const [autoZoom, setAutoZoom] = useState(true);
  const autoRef = useRef(true);
  const [adjustingZoom, setAdjustingZoom] = useState(false);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const activeRef = useRef(active);
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [sampling, setSampling] = useState(false);
  const samplingRef = useRef(false);
  const [switching, setSwitching] = useState(false);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [result, setResult] = useState<GuidanceResult | null>(null);
  const [target, setTarget] = useState<CompositionTarget | null>(null);
  const [executionPhase, setExecutionPhase] = useState<ExecutionPhase>('idle');
  const phaseRef = useRef<ExecutionPhase>('idle');
  const executor = useRef(new GuidanceExecution());
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<GuidanceStatus>({ phase: 'off', message: '开启 AI 指导，获取本轮调整方案' });
  const busyRef = useRef(false);
  const [configMissing, setConfigMissing] = useState(false);
  const [sensorAvailable, setSensorAvailable] = useState(false);
  const mounted = useRef(true);
  const config = useRef<GuidanceConfig | null>(null);
  const queue = useRef(new CameraShotQueue());
  const stableAfter = useRef(0);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<GuidanceLoop | null>(null);
  const tuningRevision = useRef(0);
  const styleRevision = useRef(0);
  const tuningBusy = useRef(false);
  const [tuningMessage, setTuningMessage] = useState('系统自动色彩');
  const [appliedTuning, setAppliedTuning] = useState<AppliedTuning | null>(null);
  const manualBusy = useRef(false);
  const [adjustingParameters, setAdjustingParameters] = useState(false);

  function resetStep() {
    if (tuningBusy.current) {
      void resetCameraTuning(contextRef.current.facing).catch(() => undefined);
      if (mounted.current) setAppliedTuning(null);
    }
    tuningRevision.current++;
    tuningBusy.current = false;
    if (stepTimer.current !== null) clearTimeout(stepTimer.current);
    stepTimer.current = null;
    executor.current.reset(); phaseRef.current = 'idle';
    if (mounted.current) { setExecutionPhase('idle'); setTarget(null); }
  }
  function syncExecution() {
    if (!mounted.current || !enabledRef.current || !activeRef.current) return;
    const execution = executor.current;
    const phase = execution.phase;
    setTarget(execution.target);
    if (phase !== phaseRef.current) {
      if (phaseRef.current === 'ready' && phase !== 'ready') setStatus({ phase: 'waiting', message: '位置已变化，请重新对准，无需联网' });
      phaseRef.current = phase; setExecutionPhase(phase);
    }
    if (phase === 'settling' && stepTimer.current === null) {
      // This is a local stability check, not a backend polling interval.
      execution.beginSettling(Date.now());
      stepTimer.current = setTimeout(checkStep, 100);
    }
  }
  function checkStep() {
    stepTimer.current = null;
    if (!mounted.current || !enabledRef.current || !activeRef.current || !readyRef.current || captureRef.current) return;
    const execution = executor.current;
    if (zoomTimer.current) { syncExecution(); return; }
    if (execution.finishIfStable(Date.now())) setStatus({ phase: 'ready', message: '已完成本地对准，可以拍照了' });
    syncExecution();
  }
  function commitContext(next: GuidanceContext) {
    contextRef.current = next; setContext(next);
    executor.current.observeCamera(next, Date.now()); syncExecution();
  }
  function applyStylePreset(style: CameraStyle, facing: 'front' | 'back', capabilities?: CameraCapabilities) {
    const revision = ++styleRevision.current;
    void (async () => {
      try {
        const readCaps = capabilities ? Promise.resolve(capabilities) : (async () => {
          try {
            return await readCameraCapabilities(facing);
          } catch {
            // onCameraReady can fire a frame before the native view is visible.
            await new Promise<void>(resolve => setTimeout(resolve, 250));
            return readCameraCapabilities(facing);
          }
        })();
        const caps = await readCaps;
        if (!mounted.current || revision !== styleRevision.current || contextRef.current.facing !== facing || !activeRef.current) return;
        commitContext({ ...contextRef.current, capabilities: caps });
        const tuning = styleTuning(style, caps);
        if (!tuning) {
          if (mounted.current && !enabledRef.current) {
            setTuningMessage(caps.native
              ? `当前镜头不支持「${style}」滤镜参数`
              : '当前安装包未包含相机参数模块，请使用含 camera-tuning 的构建');
          }
          return;
        }
        await applyCameraTuning(facing, tuning, caps);
        if (!mounted.current || revision !== styleRevision.current) return;
        setAppliedTuning({ aperture: tuning.aperture, whiteBalance: tuning.whiteBalance, contrast: tuning.contrast });
        if (!enabledRef.current) {
          const wb = { auto: '自动', daylight: '日光', cloudy: '阴天', tungsten: '钨丝灯', fluorescent: '荧光灯', keep: '系统' };
          setTuningMessage(`滤镜「${style}」· 白平衡 ${wb[tuning.whiteBalance]} · 对比度 ${tuning.contrast?.toFixed(2) ?? '系统'}`);
        }
      } catch {
        if (mounted.current && revision === styleRevision.current && !enabledRef.current) setTuningMessage(`「${style}」滤镜参数设置失败`);
      }
    })();
  }
  function finishSwitch() {
    if (switchTimer.current !== null) clearTimeout(switchTimer.current);
    switchTimer.current = null;
    if (mounted.current) setSwitching(false);
  }
  function cancelZoom() {
    if (zoomTimer.current !== null) clearTimeout(zoomTimer.current);
    zoomTimer.current = null;
    if (mounted.current) setAdjustingZoom(false);
  }
  function invalidate(message?: string) {
    cancelZoom(); resetStep();
    stableAfter.current = Date.now() + GUIDANCE_SETTLE_MS;
    loop.current?.invalidate(message);
  }
  useEffect(() => {
    aspectRef.current = viewfinderAspect;
  }, [viewfinderAspect]);
  function animateZoom(destination: number) {
    cancelZoom();
    const start = contextRef.current.zoom;
    let step = 0;
    setAdjustingZoom(true);
    const advance = () => {
      zoomTimer.current = null;
      if (!mounted.current || !enabledRef.current || !autoRef.current || captureRef.current || !activeRef.current) { cancelZoom(); return; }
      step++;
      commitContext({ ...contextRef.current, zoom: start + (destination - start) * step / 12 });
      if (step < 12) zoomTimer.current = setTimeout(advance, 50);
      else { cancelZoom(); syncExecution(); }
    };
    zoomTimer.current = setTimeout(advance, 50);
  }
  function moved(now: number) {
    stableAfter.current = now + GUIDANCE_SETTLE_MS;
    executor.current.noteMotion(now);
    if (busyRef.current) {
      loop.current?.pause('画面在请求期间发生移动，停稳后点“重新规划”');
    } else syncExecution();
  }

  useEffect(() => {
    mounted.current = true;
    const session = new GuidanceLoop({
      canSample: () => mounted.current && activeRef.current && readyRef.current && !captureRef.current && !zoomTimer.current && Date.now() >= stableAfter.current,
      waitingMessage: () => !readyRef.current ? '正在等待镜头就绪' : '请停稳手机，准备本轮分析',
      sample: async signal => {
        if (!cameraRef.current) throw new Error('相机尚未准备好。');
        samplingRef.current = true;
        if (mounted.current) setSampling(true);
        try {
          // Remove the previous plan's overrides before taking a new baseline photo.
          await resetCameraTuning(contextRef.current.facing);
          if (mounted.current) setAppliedTuning(null);
          const capabilities = await readCameraCapabilities(contextRef.current.facing);
          if (signal.aborted) throw new Error('取样已取消');
          commitContext({ ...contextRef.current, capabilities });
          setTuningMessage(capabilities.native ? '系统色彩 · 按镜头能力调整' : '系统色彩 · 当前安装包不支持手动参数');
          return await captureAnalysisSample(cameraRef.current, queue.current, signal, contextRef.current.zoom, aspectRef.current);
        }
        finally { samplingRef.current = false; if (mounted.current) setSampling(false); }
      },
      analyze: (sample, signal, onProgress) => {
        if (!config.current) throw new Error('请先配置 AI 服务。');
        return analyzeCameraSample(config.current, contextRef.current, sample, signal, onProgress);
      },
      onResult: next => {
        if (!mounted.current) return;
        setResult(next);
        if (!next) { resetStep(); return; }
        const capabilities = contextRef.current.capabilities ?? SYSTEM_CAMERA_CAPABILITIES;
        validateCameraTuning(next.advice.camera, capabilities);
        const commands = executor.current.load(next, contextRef.current, Date.now(), autoRef.current);
        // Keep the selected filter look unless the model explicitly overrides it.
        const styleCamera = styleTuning(contextRef.current.style, capabilities);
        const hardwareCamera = styleCamera ? {
          ...next.advice.camera,
          whiteBalance: next.advice.camera.whiteBalance === 'keep' ? styleCamera.whiteBalance : next.advice.camera.whiteBalance,
          contrast: next.advice.camera.contrast ?? styleCamera.contrast,
        } : next.advice.camera;
        if (needsCameraTuning(hardwareCamera)) {
          executor.current.setHardwareDone(false, Date.now());
          tuningBusy.current = true;
          const revision = ++tuningRevision.current;
          const facing = contextRef.current.facing;
          setTuningMessage('正在设置相机参数…');
          void applyCameraTuning(facing, hardwareCamera, capabilities).then(() => {
            if (!mounted.current || revision !== tuningRevision.current || !enabledRef.current) return;
            tuningBusy.current = false;
            executor.current.setHardwareDone(true, Date.now());
            setAppliedTuning({ aperture: hardwareCamera.aperture, whiteBalance: hardwareCamera.whiteBalance, contrast: hardwareCamera.contrast });
            const settings = hardwareCamera;
            const wb = { keep: '系统', auto: '自动', daylight: '日光', cloudy: '阴天', tungsten: '钨丝灯', fluorescent: '荧光灯' };
            setTuningMessage([settings.aperture === null ? '光圈：镜头默认' : `光圈 f/${settings.aperture}`, settings.contrast === null ? '对比度：系统' : `对比度 ${settings.contrast.toFixed(2)}`, `白平衡：${wb[settings.whiteBalance]}`].join(' · '));
            syncExecution();
          }).catch(() => {
            if (!mounted.current || revision !== tuningRevision.current) return;
            cancelZoom(); resetStep(); setResult(null);
            setTuningMessage('参数设置失败');
            setStatus({ phase: 'error', message: '相机未完成参数设置，请重新规划；不会自动发送请求' });
            void resetCameraTuning(facing).catch(() => undefined);
          });
        }
        if (next.advice.state === 'ready' && Date.now() < stableAfter.current) executor.current.noteMotion(Date.now());
        syncExecution();
        if (commands.flash !== undefined) commitContext({ ...contextRef.current, flash: commands.flash });
        if (commands.zoom !== undefined) animateZoom(commands.zoom);
      },
      onStatus: next => {
        busyRef.current = next.phase === 'sampling' || next.phase === 'analyzing';
        if (mounted.current) setStatus(next);
      },
      onFatal: () => {
        cancelZoom(); resetStep(); enabledRef.current = false;
        if (mounted.current) setEnabled(false);
      },
    });
    loop.current = session;
    function changeActive(next: boolean) {
      if (next === activeRef.current) return;
      activeRef.current = next; readyRef.current = false;
      styleRevision.current++;
      finishSwitch(); cancelZoom(); resetStep();
      if (mounted.current) { setActive(next); setReady(false); }
      session.stop();
      // Returning to the app requires an explicit replan; never restart network polling.
      if (next && enabledRef.current) {
        enabledRef.current = false;
        if (mounted.current) { setEnabled(false); setStatus({ phase: 'waiting', message: '请重新开启指导以规划当前画面' }); }
      }
    }
    const appListener = AppState.addEventListener('change', state => changeActive(state === 'active'));
    const layoutListener = Dimensions.addEventListener('change', () => {
      cancelZoom(); resetStep();
      session.pause('屏幕方向已变化，请重新规划');
    });
    const visibility = () => changeActive(!document.hidden);
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false; enabledRef.current = false;
      finishSwitch(); cancelZoom(); resetStep(); session.stop();
      appListener.remove(); layoutListener.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !active || Platform.OS === 'web') return;
    let disposed = false;
    const subscriptions: Array<{ remove: () => void }> = [];
    let previousAt = Date.now();
    let travel = 0;
    void Gyroscope.isAvailableAsync().then(available => {
      if (disposed) return;
      setSensorAvailable(available); executor.current.setSensors(available); syncExecution();
      if (!available) return;
      Gyroscope.setUpdateInterval(50);
      subscriptions.push(Gyroscope.addListener(rotation => {
        const now = Date.now(), dt = (now - previousAt) / 1000;
        previousAt = now;
        if (!enabledRef.current || !activeRef.current || !readyRef.current) return;
        const speed = Math.hypot(rotation.x, rotation.y, rotation.z);
        executor.current.rotate(rotation, dt, contextRef.current.facing, now);
        travel = speed > 0.12 ? travel + speed * Math.min(0.25, dt) : Math.max(0, travel - 0.008);
        if (speed > 0.12) stableAfter.current = now + GUIDANCE_SETTLE_MS;
        if (speed > 0.35 || travel > 0.12) { travel = 0; moved(now); }
        syncExecution();
      }));
    }).catch(() => { if (!disposed) { setSensorAvailable(false); executor.current.setSensors(false); syncExecution(); } });
    let acceleration: { x: number; y: number; z: number } | null = null;
    void Accelerometer.isAvailableAsync().then(available => {
      if (!available || disposed) return;
      Accelerometer.setUpdateInterval(200);
      subscriptions.push(Accelerometer.addListener(next => {
        if (acceleration && Math.hypot(next.x - acceleration.x, next.y - acceleration.y, next.z - acceleration.z) > 0.2) moved(Date.now());
        acceleration = next;
      }));
    }).catch(() => undefined);
    return () => { disposed = true; subscriptions.forEach(item => item.remove()); };
  }, [enabled, active]);

  async function toggleGuidance() {
    if (startingRef.current || captureRef.current || manualBusy.current) return;
    if (enabledRef.current) {
      enabledRef.current = false; setEnabled(false); cancelZoom(); resetStep(); loop.current?.stop(); return;
    }
    startingRef.current = true; setStarting(true);
    try {
      const saved = await getActiveAIConfig(); validateAIProfile(saved);
      if (!mounted.current || !activeRef.current) return;
      config.current = saved; setConfigMissing(false);
      enabledRef.current = true; setEnabled(true); loop.current?.start();
    } catch {
      if (mounted.current) {
        setConfigMissing(true); setStatus({ phase: 'error', message: '请先在“我的 → AI 配置”填写并保存有效的服务配置。' });
      }
    } finally { startingRef.current = false; if (mounted.current) setStarting(false); }
  }
  function toggleAutoZoom() {
    autoRef.current = !autoRef.current; setAutoZoom(autoRef.current);
    if (!autoRef.current) { cancelZoom(); return; }
    const factor = executor.current.advice?.camera.zoomFactor;
    if (factor != null && Math.abs(factor - digitalZoomFactor(contextRef.current.zoom)) <= 0.3 + 1e-6) animateZoom((factor - 1) / 3);
  }
  function manualZoom(value: number) {
    autoRef.current = false; setAutoZoom(false); cancelZoom();
    if (busyRef.current) loop.current?.pause('变焦已改变，请完成调整后重新规划');
    let zoom = Math.max(0, Math.min(1, value));
    const requested = executor.current.advice?.camera.zoomFactor;
    if (requested != null && value > 0) {
      const destination = (requested - 1) / 3;
      const current = contextRef.current.zoom;
      // The +/- buttons must be able to reach arbitrary model multipliers exactly.
      if ((destination - current) * (destination - zoom) <= 0 && Math.abs(destination - current) > 1e-6) zoom = destination;
    }
    commitContext({ ...contextRef.current, zoom });
  }
  async function adjustParameters(change: ManualCameraSettings) {
    if (!mounted.current || !activeRef.current || !readyRef.current || captureRef.current || samplingRef.current || manualBusy.current || tuningBusy.current) return;
    const facing = contextRef.current.facing;
    const hardware = change.aperture !== undefined || change.contrast !== undefined || change.whiteBalance !== undefined;
    // A manual edit ends the old plan so a late AI response cannot overwrite it.
    enabledRef.current = false; setEnabled(false);
    cancelZoom(); resetStep(); loop.current?.stop();
    const styleVersion = ++styleRevision.current;
    if (change.zoom !== undefined) manualZoom(change.zoom);
    if (change.flash !== undefined) commitContext({ ...contextRef.current, flash: change.flash });
    if (!hardware) { setTuningMessage('微调已应用'); return; }
    manualBusy.current = true; setAdjustingParameters(true);
    setTuningMessage('正在应用微调…');
    try {
      const capabilities = contextRef.current.capabilities ?? await readCameraCapabilities(facing);
      const camera: Guidance['camera'] = {
        zoomFactor: null, flash: 'keep', aperture: appliedTuning?.aperture ?? null,
        contrast: appliedTuning?.contrast ?? null, whiteBalance: appliedTuning?.whiteBalance ?? 'keep',
        ...change,
      };
      if (camera.contrast !== null && (!Number.isFinite(camera.contrast) || camera.contrast < 0.8 || camera.contrast > 1.2)) throw new Error('对比度需在 0.80–1.20 之间');
      await applyCameraTuning(facing, camera, capabilities);
      if (!mounted.current || !activeRef.current || contextRef.current.facing !== facing || styleVersion !== styleRevision.current) return;
      commitContext({ ...contextRef.current, capabilities });
      setAppliedTuning({ aperture: camera.aperture, contrast: camera.contrast, whiteBalance: camera.whiteBalance });
      setTuningMessage('微调已应用');
    } catch {
      if (mounted.current && activeRef.current && styleVersion === styleRevision.current) setTuningMessage('微调未能应用，请重试或检查镜头支持情况');
    } finally {
      manualBusy.current = false;
      if (mounted.current) setAdjustingParameters(false);
    }
  }
  function changeStyle(style: CameraStyle) {
    if (manualBusy.current) return;
    invalidate();
    commitContext({ ...contextRef.current, style });
    if (mounted.current && activeRef.current && readyRef.current) {
      applyStylePreset(style, contextRef.current.facing);
    }
  }
  function changeMode(mode: CameraMode) { invalidate(); commitContext({ ...contextRef.current, mode }); }
  function flipCamera() {
    if (!mounted.current || !activeRef.current || !readyRef.current || captureRef.current || samplingRef.current || manualBusy.current) return;
    readyRef.current = false; setReady(false); setSwitching(true);
    invalidate('正在切换镜头，准备新方案');
    setAppliedTuning(null);
    switchTimer.current = setTimeout(cameraError, 10000);
    commitContext({ ...contextRef.current, facing: contextRef.current.facing === 'front' ? 'back' : 'front', zoom: 0, flash: 'off', capabilities: undefined });
  }
  function cameraReady() {
    if (!mounted.current || !activeRef.current) return;
    finishSwitch(); stableAfter.current = Date.now() + GUIDANCE_SETTLE_MS;
    readyRef.current = true; setReady(true);
    applyStylePreset(contextRef.current.style, contextRef.current.facing);
  }
  function cameraError() {
    if (!mounted.current || !activeRef.current) return;
    finishSwitch(); cancelZoom(); resetStep(); readyRef.current = false; setReady(false);
    enabledRef.current = false; setEnabled(false); loop.current?.stop();
    setStatus({ phase: 'error', message: '相机未能启动，请退出取景器后重试并检查相机权限。' });
    setAppliedTuning(null);
  }
  function confirmAdjustment() {
    if (!enabledRef.current || !readyRef.current || !activeRef.current || captureRef.current || busyRef.current) return;
    if (executor.current.confirmManual(Date.now())) syncExecution();
  }
  async function capture() {
    if (captureRef.current || !readyRef.current || !activeRef.current || tuningBusy.current || manualBusy.current) return;
    const aspect = aspectRef.current;
    const zoom = contextRef.current.zoom;
    captureRef.current = true; setCapturing(true); cancelZoom(); resetStep(); loop.current?.stop();
    setStatus({ phase: 'waiting', message: '拍摄中，AI 分析已暂停' });
    try {
      await queue.current.run(async () => {
        if (!mounted.current || !activeRef.current) return;
        const picture = await cameraRef.current?.takePictureAsync({ quality: 0.9, skipProcessing: false });
        if (!picture?.uri) throw new Error('没有获取到照片');
        if (!mounted.current || !activeRef.current) { await removeSampleFile(picture.uri); return; }
        const uri = await prepareCapturedPhoto(picture, zoom, aspect);
        if (!mounted.current || !activeRef.current) { await removeSampleFile(uri); return; }
        onCapture(uri);
      });
    } catch { if (mounted.current) setStatus({ phase: 'error', message: '拍摄失败，请稍后重试。' }); }
    finally {
      captureRef.current = false;
      // Capture never automatically starts another model request.
      enabledRef.current = false;
      if (mounted.current) { setCapturing(false); setEnabled(false); }
    }
  }
  return { context, enabled, autoZoom, adjustingZoom, adjustingParameters, ready, active, capturing, sampling, switching, starting, result, target, executionPhase, status, configMissing, sensorAvailable, tuningMessage, appliedTuning,
    toggleGuidance, toggleAutoZoom, manualZoom, adjustParameters, changeStyle, changeMode, flipCamera, cameraReady, cameraError, capture, confirmAdjustment,
    refresh: () => invalidate('正在重新规划当前画面') };
}
