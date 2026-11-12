import { CAMERA_STYLES } from '../constants/guidance';
import { POSE_LIBRARY, POSE_SCHEMA, POSE_SYSTEM_PROMPT, POSE_TIMEOUT_MS, type PoseId, type PoseRecommendation } from '../constants/poses';
import type { GuidanceConfig, GuidanceContext, GuidanceSample } from '../types/guidance';
import { requestAICompletion, type AIMessage } from './aiClient';
import { GuidanceProtocolError, validateSchema } from './guidanceProtocol';

export function parsePoseRecommendation(text: string): PoseRecommendation {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new GuidanceProtocolError('姿势推荐必须是完整 JSON 对象'); }
  validateSchema(value, POSE_SCHEMA);
  const raw = value as { state: 'pose' | 'uncertain'; confidence: number; poses: { id: PoseId; name: string; tip: string }[] };
  const seen = new Set<PoseId>();
  // Duplicates are harmless to drop; everything else must already match the schema.
  const poses = raw.poses.filter(item => !seen.has(item.id) && !!seen.add(item.id))
    .map(item => ({ id: item.id, name: item.name.trim() || POSE_LIBRARY[item.id].name, tip: item.tip.trim() }));
  const state = raw.state === 'pose' && raw.confidence >= 0.6 ? 'pose' : 'uncertain';
  return { state, confidence: raw.confidence, poses };
}

export async function recommendPoses(config: GuidanceConfig, context: GuidanceContext, sample: GuidanceSample, signal: AbortSignal) {
  if (!sample.dataUrl.startsWith('data:image/jpeg;base64,') || sample.dataUrl.length > 2_000_000) {
    throw new Error('分析图片格式或大小不合适，请重试。');
  }
  const messages: AIMessage[] = [
    { role: 'system', content: POSE_SYSTEM_PROMPT },
    { role: 'user', content: [
      { type: 'text', text: `拍摄模式：${context.mode}。风格：${context.style}，${CAMERA_STYLES[context.style]}\n镜头：${context.facing === 'front' ? '前置（自拍）' : '后置（他人拍摄）'}，画面不镜像。请为画面中的被拍者推荐姿势。` },
      { type: 'image_url', image_url: { url: sample.dataUrl } },
    ] },
  ];
  if (signal.aborted) throw new Error('AI 请求已取消。');
  const result = await requestAICompletion(config.provider, config, messages, {
    signal, timeoutMs: POSE_TIMEOUT_MS, json: true,
    outputSchema: { name: 'pose_recommendation_v1', schema: POSE_SCHEMA },
  });
  if (signal.aborted) throw new Error('AI 请求已取消。');
  return parsePoseRecommendation(result.content);
}
