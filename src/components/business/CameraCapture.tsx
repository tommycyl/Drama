import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors, shadows } from '../../constants/theme';
import { CAMERA_STYLES } from '../../constants/guidance';
import type { CameraStyle } from '../../types/guidance';
import { useCameraGuidance } from '../../hooks/useCameraGuidance';
import { CameraGuidanceControls } from './CameraGuidanceControls';
import { CameraParameterPanel } from './CameraParameterPanel';
import { CameraDirectionOverlay } from './CameraDirectionOverlay';
import { CameraReadyFrame, CameraReadyNotice, CameraShutterHalo } from './CameraReadyEffects';
import { digitalZoomFactor } from '../../lib/cameraGeometry';
import { getCompositionMessage } from '../../lib/compositionMessage';
import { getDirectionCue } from '../../lib/guidanceDirection';
import { useCaptureStore } from '../../store/captureStore';

type Props = {
  cameraRef: React.RefObject<CameraView>;
  onClose: () => void;
  onCapture: (uri: string) => void;
  onConfigure: () => void;
  onOpenGallery?: () => void;
};

const MODES = ['人像', '风景', '夜景'] as const;
const ZOOM_STEPS = [0, 1 / 3, 2 / 3, 1];
const ZOOM_LABELS = ['1x', '2x', '3x', '4x'];

const WHITE_BALANCE_LABEL: Record<string, string> = {
  auto: '自动',
  daylight: '日光',
  cloudy: '阴天',
  tungsten: '钨丝灯',
  fluorescent: '荧光灯',
};

function cueIcon(cue: ReturnType<typeof getDirectionCue>): keyof typeof Ionicons.glyphMap {
  if (cue.kind === 'move') {
    if (Math.abs(cue.x) >= Math.abs(cue.y)) return cue.x < 0 ? 'arrow-back' : 'arrow-forward';
    return cue.y < 0 ? 'arrow-up' : 'arrow-down';
  }
  if (cue.kind === 'tilt') return cue.y < 0 ? 'arrow-up' : 'arrow-down';
  if (cue.kind === 'distance') return cue.y < 0 ? 'arrow-up' : 'arrow-down';
  if (cue.kind === 'zoom') return 'search-outline';
  return 'ellipse-outline';
}

function cueLabel(cue: ReturnType<typeof getDirectionCue>): string {
  if (cue.kind === 'move') {
    const horizontal = cue.x < 0 ? '左' : cue.x > 0 ? '右' : '';
    const vertical = cue.y < 0 ? '上' : cue.y > 0 ? '下' : '';
    return `${horizontal}${vertical}移`;
  }
  if (cue.kind === 'tilt') return cue.y < 0 ? '微仰' : '微俯';
  if (cue.kind === 'distance') return cue.y < 0 ? '靠近' : '远离';
  if (cue.kind === 'zoom') return '变焦';
  return '';
}

export function CameraCapture({ cameraRef, onClose, onCapture, onConfigure, onOpenGallery }: Props) {
  const [viewfinder, setViewfinder] = useState({ width: 0, height: 0 });
  const viewfinderAspect = viewfinder.height > 0 ? viewfinder.width / viewfinder.height : 3 / 4;
  const guide = useCameraGuidance(cameraRef, onCapture, viewfinderAspect);
  const [tuningOpen, setTuningOpen] = useState(false);
  const savedUris = useCaptureStore((state) => state.savedUris);
  const galleryThumb = savedUris[0];

  const { context } = guide;
  const blocked = !guide.active || !guide.ready || guide.capturing || guide.sampling || guide.adjustingParameters;
  const canShoot = guide.enabled && guide.executionPhase === 'ready';
  const message = guide.switching
    ? '正在切换镜头…'
    : getCompositionMessage(
        guide.enabled,
        guide.target,
        guide.result,
        guide.adjustingZoom,
        guide.autoZoom,
        guide.status,
        guide.executionPhase,
      );
  const bannerMessage = guide.enabled && guide.result && !canShoot
    ? `${message} · ${guide.result.advice.light}`
    : message;

  const cue = guide.enabled && guide.result ? getDirectionCue(guide.result.advice) : null;
  const showCue = cue && cue.kind !== 'hold' && cue.kind !== 'uncertain';

  const aperture = guide.appliedTuning?.aperture ?? context.capabilities?.apertures[0] ?? null;
  const whiteBalance = guide.appliedTuning?.whiteBalance && guide.appliedTuning.whiteBalance !== 'keep'
    ? WHITE_BALANCE_LABEL[guide.appliedTuning.whiteBalance] ?? '自动'
    : '自动';
  const contrast = guide.appliedTuning?.contrast != null ? guide.appliedTuning.contrast.toFixed(2) : '系统';
  const params = [
    { label: '变焦', value: `${digitalZoomFactor(context.zoom).toFixed(1)}x` },
    { label: '光圈', value: aperture ? `f/${aperture}` : '自动' },
    { label: '白平衡', value: whiteBalance },
    { label: '对比度', value: contrast },
    { label: '闪光灯', value: context.flash === 'on' ? '开' : context.flash === 'auto' ? '自动' : '关' },
  ];
  const activeZoomStep = ZOOM_STEPS.findIndex((step) => Math.abs(step - context.zoom) < 0.06);

  return (
    <View collapsable={false} style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* ── Brand header ── */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <Ionicons name="camera-outline" size={29} color={colors.primary} />
            <View>
              <Text style={styles.headerTitle}>Drama相机</Text>
              <Text style={styles.headerSubtitle}>AI 电影画质</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="AI 配置"
              onPress={onConfigure}
              style={({ pressed }) => [styles.headerButton, pressed && styles.headerButtonPressed]}
            >
              <Ionicons name="options-outline" size={21} color={colors.onSurfaceVariant} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭相机"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="chevron-down" size={19} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.body}>
          {/* ── Scene modes ── */}
          <View style={styles.sceneRow}>
            <View style={styles.scenePill}>
              <View style={styles.sceneDot} />
              {MODES.map((mode) => {
                const active = context.mode === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    disabled={guide.capturing}
                    onPress={() => guide.changeMode(mode)}
                    style={[styles.sceneMode, active && styles.sceneModeActive]}
                  >
                    <Text style={[styles.sceneModeText, active && styles.sceneModeTextActive]}>
                      {mode}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Live viewfinder ── */}
          <View
            testID="camera-viewfinder"
            collapsable={false}
            style={styles.viewfinderCard}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              if (Math.abs(width - viewfinder.width) > 1 || Math.abs(height - viewfinder.height) > 1) {
                setViewfinder({ width, height });
              }
            }}
          >
            {guide.active && (
              <View
                collapsable={false}
                style={[StyleSheet.absoluteFill, { transform: [{ scale: digitalZoomFactor(context.zoom) }] }]}
              >
                {/* Omit ratio: Android otherwise switches from FILL_CENTER to FIT_CENTER
                    and adds black bars when the responsive viewfinder is not 3:4.
                    Expo mirrors the front preview even when photos use mirror=false. */}
                <CameraView
                  ref={cameraRef}
                  style={[StyleSheet.absoluteFill, { transform: [{ scaleX: context.facing === 'front' ? -1 : 1 }] }]}
                  facing={context.facing}
                  zoom={0}
                  mirror={false}
                  flash={context.flash}
                  autofocus="off"
                  animateShutter={false}
                  onCameraReady={guide.cameraReady}
                  onMountError={guide.cameraError}
                />
              </View>
            )}

            {/* warm cinematic vignette */}
            <LinearGradient
              colors={['rgba(24, 22, 18, 0.28)', 'transparent', 'rgba(24, 22, 18, 0.46)']}
              locations={[0, 0.35, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* rule-of-thirds grid */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={[styles.gridVertical, { left: '33.33%' }]} />
              <View style={[styles.gridVertical, { left: '66.66%' }]} />
              <View style={[styles.gridHorizontal, { top: '33.33%' }]} />
              <View style={[styles.gridHorizontal, { top: '66.66%' }]} />

              <CameraDirectionOverlay
                target={guide.target}
                enabled={guide.enabled && guide.ready}
                width={viewfinder.width}
                height={viewfinder.height}
              />
              <CameraReadyFrame
                active={canShoot}
                width={viewfinder.width}
                height={viewfinder.height}
              />
            </View>

            {/* guidance banner */}
            <View pointerEvents="box-none" style={styles.bannerWrap}>
              <CameraReadyNotice
                active={canShoot}
                message={bannerMessage}
                action={
                  showCue && cue ? (
                    <View style={styles.cueChip}>
                      <Ionicons name={cueIcon(cue)} size={13} color={colors.secondaryFixed} />
                      <Text style={styles.cueChipText}>{cueLabel(cue)}</Text>
                    </View>
                  ) : null
                }
              />
            </View>

            {/* focal length pill */}
            <View style={styles.focalWrap}>
              <View style={styles.focalPill}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="缩小画面"
                  disabled={guide.capturing || context.zoom <= 0}
                  onPress={() => guide.manualZoom(context.zoom - 0.05)}
                  style={[styles.focalAdjust, (guide.capturing || context.zoom <= 0) && styles.disabled]}
                >
                  <Ionicons name="remove" size={15} color="#E4E2DF" />
                </Pressable>
                {ZOOM_STEPS.map((step, index) => {
                  const active = activeZoomStep === index;
                  return (
                    <Pressable
                      key={ZOOM_LABELS[index]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      disabled={guide.capturing}
                      onPress={() => guide.manualZoom(step)}
                      style={[styles.focalStep, active && styles.focalStepActive]}
                    >
                      <Text style={[styles.focalStepText, active && styles.focalStepTextActive]}>
                        {ZOOM_LABELS[index]}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="放大画面"
                  disabled={guide.capturing || context.zoom >= 1}
                  onPress={() => guide.manualZoom(context.zoom + 0.05)}
                  style={[styles.focalAdjust, (guide.capturing || context.zoom >= 1) && styles.disabled]}
                >
                  <Ionicons name="add" size={15} color="#E4E2DF" />
                </Pressable>
              </View>
            </View>
          </View>

          {/* manual confirm */}
          {guide.enabled && guide.executionPhase === 'manual' && (
            <View style={styles.confirmSlot}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="手动确认已调整"
                disabled={guide.capturing || !guide.ready}
                onPress={guide.confirmAdjustment}
                style={({ pressed }) => [
                  styles.confirmStep,
                  (guide.capturing || !guide.ready) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="checkmark" size={15} color={colors.secondaryFixed} />
                <Text style={styles.confirmStepText}>已调整，确认到位</Text>
              </Pressable>
            </View>
          )}

          {/* ── Auto parameter card ── */}
          <View style={styles.paramCard}>
            <View style={styles.paramHeader}>
              <View style={styles.paramTitleRow}>
                <View style={styles.paramDot} />
                <Text style={styles.paramTitle}>相机实时参数</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="微调相机参数"
                accessibilityState={{ expanded: tuningOpen }}
                disabled={blocked || guide.executionPhase === 'parameters'}
                onPress={() => setTuningOpen(true)}
                style={({ pressed }) => [styles.tuneButton, (blocked || pressed) && { opacity: 0.7 }]}
              >
                <Ionicons name="options-outline" size={13} color={colors.onSurfaceVariant} />
                <Text style={styles.tuneButtonText}>微调</Text>
              </Pressable>
            </View>

            <View style={styles.paramRow}>
              {params.map((param) => (
                <View key={param.label} style={styles.paramCell}>
                  <Text style={styles.paramLabel}>
                    {param.label}
                  </Text>
                  <Text style={styles.paramValue} numberOfLines={1} adjustsFontSizeToFit>
                    {param.value}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.tuningText} numberOfLines={1}>
              {guide.tuningMessage} · {context.facing === 'front' ? '前置' : '后置'}
            </Text>
          </View>

          {/* ── Guidance controls ── */}
          <CameraGuidanceControls
            enabled={guide.enabled}
            starting={guide.starting}
            disabled={guide.capturing || guide.adjustingParameters}
            autoZoom={guide.autoZoom}
            status={guide.status}
            configMissing={guide.configMissing}
            onToggle={() => void guide.toggleGuidance()}
            onAutoZoom={guide.toggleAutoZoom}
            onRefresh={guide.refresh}
            onConfigure={onConfigure}
          />

          {/* ── Creative style strip ── */}
          <View style={styles.styleStrip}>
            {(Object.keys(CAMERA_STYLES) as CameraStyle[]).map((style) => {
              const active = context.style === style;
              return (
                <Pressable
                  key={style}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={guide.capturing}
                  onPress={() => guide.changeStyle(style)}
                  style={[styles.styleItem, active && styles.styleItemActive]}
                >
                  <Text style={[styles.styleText, active && styles.styleTextActive]}>{style}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── Capture deck ── */}
          <View style={styles.captureDeck}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="查看最近相片"
              onPress={onOpenGallery}
              style={({ pressed }) => [
                styles.galleryButton,
                { transform: [{ scale: pressed ? 0.95 : 1 }] },
              ]}
            >
              {galleryThumb ? (
                <Image source={{ uri: galleryThumb }} style={styles.galleryImage} />
              ) : (
                <View style={styles.galleryPlaceholder}>
                  <Ionicons name="images-outline" size={19} color={colors.onSurfaceVariant} />
                </View>
              )}
              <View pointerEvents="none" style={styles.galleryRing} />
            </Pressable>

            <View style={styles.shutterArea}>
              <CameraShutterHalo active={canShoot} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="拍照"
                disabled={!guide.ready || guide.capturing || guide.adjustingParameters || !guide.active || guide.executionPhase === 'parameters'}
                onPress={() => void guide.capture()}
                style={({ pressed }) => [
                  styles.shutter,
                  canShoot && styles.readyShutter,
                  (!guide.ready || guide.capturing) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <LinearGradient
                  colors={
                    canShoot
                      ? ['#FFE08E', '#FEDD84', '#F6E3B4']
                      : ['#E3C36E', '#FEDD84', '#FBF4E4']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.shutterInner}
                >
                  {guide.capturing ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Ionicons name="camera" size={25} color={colors.primary} />
                  )}
                </LinearGradient>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="切换前后镜头"
              disabled={blocked}
              accessibilityState={{ disabled: blocked, busy: guide.switching }}
              onPress={guide.flipCamera}
              style={({ pressed }) => [
                styles.flipButton,
                blocked && styles.disabled,
                { transform: [{ scale: pressed ? 0.95 : 1 }] },
              ]}
            >
              {guide.switching ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Ionicons name="camera-reverse-outline" size={22} color={colors.primary} />
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
      {tuningOpen && <CameraParameterPanel visible={tuningOpen} context={context}
        appliedTuning={guide.appliedTuning} disabled={blocked || guide.executionPhase === 'parameters'}
        busy={guide.adjustingParameters} message={guide.tuningMessage}
        onClose={() => setTuningOpen(false)} onChange={guide.adjustParameters} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
    gap: 8,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: colors.primary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonPressed: {
    backgroundColor: colors.surfaceContainer,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 2,
    borderColor: 'rgba(254, 221, 132, 0.45)',
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },

  /* scene pills */
  sceneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 2,
  },
  scenePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surfaceLow,
    ...shadows.glassSm,
  },
  sceneDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.secondaryFixedDim,
    marginLeft: 6,
    marginRight: 2,
  },
  sceneMode: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sceneModeActive: {
    backgroundColor: colors.secondaryContainer,
  },
  sceneModeText: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  sceneModeTextActive: {
    color: colors.onSecondaryContainer,
    fontWeight: '700',
  },

  /* viewfinder */
  viewfinderCard: {
    flex: 1,
    minHeight: 180,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surfaceHigh,
    position: 'relative',
    ...shadows.glassMd,
  },
  gridVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  gridHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  bannerWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 12,
  },
  cueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.primary,
    ...shadows.glassSm,
  },
  cueChipText: {
    color: colors.secondaryFixed,
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  focalWrap: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 12,
  },
  focalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(45, 42, 38, 0.72)',
    ...shadows.glassSm,
  },
  focalAdjust: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focalStep: {
    width: 32,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focalStepActive: {
    backgroundColor: colors.secondaryContainer,
  },
  focalStepText: {
    color: '#E4E2DF',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  focalStepTextActive: {
    color: colors.onSecondaryContainer,
    fontWeight: '700',
  },

  /* confirm */
  confirmSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  confirmStepText: {
    color: colors.secondaryFixed,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  /* parameter card */
  paramCard: {
    backgroundColor: colors.surfaceLow,
    borderRadius: 22,
    padding: 11,
    gap: 7,
    ...shadows.glassSm,
  },
  paramHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paramTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  paramDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.secondary,
  },
  paramTitle: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  tuneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceHighest,
  },
  tuneButtonText: {
    color: colors.onSurfaceVariant,
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  paramRow: {
    flexDirection: 'row',
    gap: 5,
  },
  paramCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 12,
    gap: 1,
    backgroundColor: colors.surface,
    ...shadows.glassSm,
  },
  paramLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.7,
  },
  paramValue: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  tuningText: {
    color: colors.onSurfaceVariant,
    fontSize: 9.5,
    fontWeight: '500',
    letterSpacing: 0.3,
    textAlign: 'center',
    opacity: 0.8,
  },

  /* style strip */
  styleStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceContainer,
  },
  styleItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 999,
  },
  styleItemActive: {
    backgroundColor: colors.surface,
    ...shadows.glassSm,
  },
  styleText: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  styleTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  /* capture deck */
  captureDeck: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginTop: 2,
  },
  galleryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    backgroundColor: colors.surfaceContainer,
    ...shadows.glassSm,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  galleryPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHighest,
  },
  galleryRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.secondaryContainer,
  },
  shutterArea: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 7,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.glassLg,
  },
  readyShutter: {
    backgroundColor: '#1E1B17',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
    ...shadows.glassSm,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
