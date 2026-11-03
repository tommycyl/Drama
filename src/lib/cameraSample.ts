import type { CameraView } from 'expo-camera';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { CameraShotQueue } from './guidanceRules';
import type { GuidanceSample } from '../types/guidance';
import { getPhotoCrop } from './cameraGeometry';

export async function removeSampleFile(uri?: string) {
  if (Platform.OS !== 'web' && uri?.startsWith('file:') && FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory)) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

export async function captureAnalysisSample(camera: CameraView, queue: CameraShotQueue, signal: AbortSignal, zoom = 0, aspect = 3 / 4): Promise<GuidanceSample> {
  let source: string | undefined;
  let resized: string | undefined;
  let capturedAt = 0;
  try {
    const picture = await queue.run(async () => {
      capturedAt = Date.now();
      return camera.takePictureAsync({ quality: 0.65, skipProcessing: false, shutterSound: false });
    }, signal);
    source = picture?.uri;
    if (signal.aborted) throw new Error('取样已取消');
    if (!picture?.uri || !picture.width || !picture.height) throw new Error('未能获取相机画面，请保持相机开启。');
    const crop = getPhotoCrop(picture.width, picture.height, zoom, aspect);
    const resize = { height: Math.min(crop.height, 768) };
    const image = await manipulateAsync(picture.uri, [{ crop }, { resize }], { compress: 0.65, format: SaveFormat.JPEG, base64: true });
    resized = image.uri;
    if (signal.aborted) throw new Error('取样已取消');
    if (!image.base64) throw new Error('画面压缩失败，请重试。');
    return { dataUrl: `data:image/jpeg;base64,${image.base64}`, capturedAt };
  } finally {
    // Only sampling files are removed; shutter photos use a separate code path.
    await Promise.allSettled([...new Set([source, resized])].map(removeSampleFile));
  }
}

export async function prepareCapturedPhoto(picture: { uri: string; width: number; height: number }, zoom: number, aspect = 3 / 4) {
  const crop = getPhotoCrop(picture.width, picture.height, zoom, aspect);
  if (crop.width === picture.width && crop.height === picture.height) return picture.uri;
  try {
    const image = await manipulateAsync(picture.uri, [{ crop }], { compress: 0.95, format: SaveFormat.JPEG });
    return image.uri;
  } finally {
    await removeSampleFile(picture.uri).catch(() => undefined);
  }
}
