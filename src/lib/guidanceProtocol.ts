import { GUIDANCE_SCHEMA } from '../constants/guidanceProtocol';
import type { Guidance } from '../types/guidance';

export class GuidanceProtocolError extends Error {
  readonly code = 'GUIDANCE_PROTOCOL';
  constructor(reason: string) { super(`JSON 协议不匹配：${reason}`); this.name = 'GuidanceProtocolError'; }
}

type Schema = {
  type?: string; anyOf?: readonly Schema[]; enum?: readonly unknown[];
  required?: readonly string[]; properties?: Readonly<Record<string, Schema>>; additionalProperties?: boolean;
  minLength?: number; maxLength?: number; minimum?: number; maximum?: number;
  items?: Schema; minItems?: number; maxItems?: number;
};
export function validateSchema(value: unknown, schema: Schema, path = 'response'): void { validate(value, schema, path); }
function validate(value: unknown, schema: Schema, path: string): void {
  const fail = (reason: string): never => { throw new GuidanceProtocolError(`${path} ${reason}`); };
  if (schema.anyOf) {
    if (schema.anyOf.some(branch => { try { validate(value, branch, path); return true; } catch { return false; } })) return;
    fail('类型或坐标不合法');
  }
  if (schema.type === 'null') { if (value !== null) fail('必须为 null'); return; }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) fail('必须为数组');
    const list = value as unknown[];
    if (list.length < (schema.minItems ?? 0) || list.length > (schema.maxItems ?? Infinity)) fail('数量不合法');
    if (schema.items) list.forEach((item, index) => validate(item, schema.items!, `${path}[${index}]`));
  } else if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('必须为对象');
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!Object.prototype.hasOwnProperty.call(object, key)) fail(`缺少 ${key}`);
    if (schema.additionalProperties === false && Object.keys(object).some(key => !Object.prototype.hasOwnProperty.call(schema.properties, key))) fail('含额外字段');
    for (const [key, child] of Object.entries(schema.properties ?? {})) validate(object[key], child, key);
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) fail('必须为有限数字');
    const number = value as number;
    if (schema.type === 'integer' && !Number.isInteger(number)) fail('必须为整数');
    if (number < (schema.minimum ?? -Infinity) || number > (schema.maximum ?? Infinity)) fail('超出范围');
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') fail('必须为字符串');
    const text = value as string;
    if (text.trim().length < (schema.minLength ?? 0) || text.length > (schema.maxLength ?? Infinity)) fail('文字长度不合法');
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') fail('必须为布尔值');
  if (schema.enum && !schema.enum.includes(value)) fail('枚举值不合法');
}

export function parseGuidanceProtocol(text: string): Guidance {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new GuidanceProtocolError('必须是完整 JSON 对象，禁止 Markdown 或说明文字'); }
  validate(value, GUIDANCE_SCHEMA, 'response');
  const advice = value as Guidance;
  const actions = [advice.horizontal, advice.vertical, advice.tilt, advice.distance, advice.zoom];
  const holds = actions.every(action => action === 'hold');
  const point = advice.aimPoint;
  const aligned = !!point && Math.hypot(point.x - 0.5, (point.y - 0.5) * 4 / 3) <= 0.035;
  const cameraAction = advice.camera.zoomFactor !== null || advice.camera.flash !== 'keep'
    || advice.camera.aperture !== null || advice.camera.contrast !== null || advice.camera.whiteBalance !== 'keep';
  const fail = (reason: string): never => { throw new GuidanceProtocolError(reason); };
  if (advice.state === 'uncertain') {
    if (advice.confidence >= 0.6 || !holds || point !== null || advice.readyToShoot || cameraAction) fail('uncertain 必须低置信度、无动作、无终点、不可拍照');
  } else {
    if (advice.confidence < 0.6) fail('低置信度必须使用 uncertain');
    if (advice.state === 'aim' && (!point || !holds || advice.readyToShoot)) fail('aim 必须有终点、所有动作 hold、不可拍照');
    if (advice.state === 'adjust' && (point !== null || (holds && !cameraAction) || advice.readyToShoot)) fail('adjust 必须有调整动作、无终点、不可拍照');
    if (advice.state === 'ready' && (!holds || !aligned || !advice.readyToShoot || advice.confidence < 0.8 || cameraAction)) fail('ready 必须对准中心、无待调整动作、置信度至少0.8并明确可拍照');
  }
  if (advice.zoom !== 'hold' && actions.slice(0, 4).some(action => action !== 'hold')) fail('变焦不能与机位动作同时执行');
  if ((advice.state === 'aim' ? 'straight' : 'none') !== advice.route.path) fail('只有 aim 使用 straight 路线，其余状态必须为 none');
  if (advice.zoom !== 'hold' && advice.camera.zoomFactor === null) fail('变焦动作必须提供 camera.zoomFactor 的绝对倍率');
  if (cameraAction && advice.confidence < 0.8) fail('执行相机参数要求置信度至少0.8');
  return advice;
}
