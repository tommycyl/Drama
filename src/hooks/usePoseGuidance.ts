import { useEffect, useRef, useState } from 'react';
import { getActiveAIConfig } from '../lib/aiConfig';
import { validateAIProfile } from '../lib/aiClient';
import { recommendPoses } from '../lib/aiPose';
import type { PoseRecommendation } from '../constants/poses';
import type { GuidanceConfig, GuidanceContext, GuidanceSample } from '../types/guidance';

export type PosePhase = 'off' | 'waiting' | 'analyzing' | 'ready' | 'error';

type Options = {
  sampleFrame: (signal: AbortSignal) => Promise<GuidanceSample>;
  context: GuidanceContext;
  cameraReady: boolean;
  active: boolean;
};

// One AI request per explicit action (turning the guide on or long-pressing it).
// Results stay on screen; nothing is re-requested on a timer.
export function usePoseGuidance({ sampleFrame, context, cameraReady, active }: Options) {
  const [enabled, setEnabled] = useState(false);
  const enabledRef = useRef(false);
  const [phase, setPhase] = useState<PosePhase>('off');
  const [message, setMessage] = useState('');
  const [recommendation, setRecommendation] = useState<PoseRecommendation | null>(null);
  const [index, setIndex] = useState(0);
  const [starting, setStarting] = useState(false);
  const [configMissing, setConfigMissing] = useState(false);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const config = useRef<GuidanceConfig | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ sampleFrame, context, cameraReady, active });
  latest.current = { sampleFrame, context, cameraReady, active };

  function cancel() {
    controller.current?.abort();
    controller.current = null;
  }

  async function run() {
    const { cameraReady: ready, active: visible } = latest.current;
    if (!enabledRef.current || !pending.current || controller.current || !config.current || !ready || !visible) return;
    pending.current = false;
    const abort = new AbortController();
    controller.current = abort;
    setPhase('analyzing'); setMessage('AI 正在挑选姿势…');
    try {
      const sample = await latest.current.sampleFrame(abort.signal);
      if (abort.signal.aborted) return;
      const next = await recommendPoses(config.current, latest.current.context, sample, abort.signal);
      if (abort.signal.aborted || !mounted.current) return;
      setRecommendation(next); setIndex(0); setPhase('ready');
      setMessage(next.state === 'uncertain' ? '暂未看清人物，先按场景试试' : '');
    } catch (error) {
      if (abort.signal.aborted || !mounted.current) return;
      setPhase('error');
      setMessage(error instanceof Error ? error.message : '姿势推荐失败，长按小框重试');
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; enabledRef.current = false; cancel(); };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (cameraReady && active) { void run(); return; }
    // Camera switching or app in background: drop the in-flight shot and resume this
    // same request once the camera is back. Finished recommendations are kept.
    if (controller.current) {
      cancel(); pending.current = true;
      setPhase('waiting'); setMessage('等待镜头就绪');
    }
  }, [enabled, cameraReady, active]);

  async function toggle() {
    if (starting) return;
    if (enabledRef.current) {
      enabledRef.current = false; pending.current = false; cancel();
      setEnabled(false); setPhase('off'); setMessage(''); setRecommendation(null); setIndex(0);
      return;
    }
    setStarting(true);
    try {
      const saved = await getActiveAIConfig(); validateAIProfile(saved);
      if (!mounted.current) return;
      config.current = saved; setConfigMissing(false);
      enabledRef.current = true; pending.current = true;
      setPhase('waiting'); setMessage('等待镜头就绪');
      setEnabled(true);
    } catch {
      if (!mounted.current) return;
      setConfigMissing(true); setPhase('error'); setMessage('请先在“我的 → AI 配置”填写并保存有效的服务配置。');
    } finally {
      if (mounted.current) setStarting(false);
    }
  }

  function refresh() {
    if (!enabledRef.current) return;
    cancel(); pending.current = true;
    setPhase('waiting'); setMessage('等待镜头就绪');
    void run();
  }

  function next() {
    const count = recommendation?.poses.length ?? 0;
    if (count > 1) setIndex(current => (current + 1) % count);
  }

  const current = recommendation?.poses[index] ?? null;
  return { enabled, starting, phase, message, recommendation, index, current, configMissing, toggle, refresh, next };
}
