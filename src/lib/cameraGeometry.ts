// Use the same digital crop for preview, analysis and saved photos. Expo SDK 52
// maps native zoom differently on Android and iOS and exposes no maxZoom query.
export function digitalZoomFactor(zoom: number) {
  return 1 + Math.max(0, Math.min(1, zoom)) * 3;
}

// This viewport never grows with zoom. Native camera surfaces can paint outside
// transformed parents, so CameraCapture also masks everything outside this rect.
export function getCameraViewport(width: number, height: number, topInset: number, bottomInset: number) {
  const availableHeight = Math.max(0, height - topInset - bottomInset);
  const previewWidth = Math.max(0, Math.min(width, availableHeight * 3 / 4));
  const previewHeight = previewWidth * 4 / 3;
  return {
    width: previewWidth, height: previewHeight,
    left: (width - previewWidth) / 2,
    top: topInset + (availableHeight - previewHeight) / 2,
  };
}

export function getPhotoCrop(width: number, height: number, zoom: number, aspect = 3 / 4) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new Error('相机图片尺寸无效。');
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('取景框比例无效。');
  // Match the native center-fill preview, then apply the same digital zoom.
  const baseWidth = Math.min(width, height * aspect);
  const baseHeight = baseWidth / aspect;
  const factor = digitalZoomFactor(zoom);
  const cropWidth = Math.max(1, Math.floor(baseWidth / factor));
  const cropHeight = Math.max(1, Math.floor(baseHeight / factor));
  return {
    originX: Math.floor((width - cropWidth) / 2), originY: Math.floor((height - cropHeight) / 2),
    width: cropWidth, height: cropHeight,
  };
}
