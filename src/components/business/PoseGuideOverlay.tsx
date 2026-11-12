import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../constants/theme';
import {
  DEFAULT_MOTION,
  DEFAULT_POSE,
  POSE_JOINTS,
  POSE_LIBRARY,
  POSE_RIG,
  type PoseDefinition,
  type PoseId,
  type PoseJoint,
  type PoseJoints,
  type PoseSuggestion,
} from '../../constants/poses';
import type { PosePhase } from '../../hooks/usePoseGuidance';

const SCALE = 0.72;
const FIG_W = Math.round(POSE_RIG.width * SCALE);
const FIG_H = Math.round(POSE_RIG.height * SCALE);
const FILL = '#FBF4E4';
const EDGE = 'rgba(40, 36, 31, 0.42)';
const PROP_COLOR = 'rgba(251, 244, 228, 0.28)';

type Props = {
  visible: boolean;
  phase: PosePhase;
  message: string;
  suggestion: PoseSuggestion | null;
  index: number;
  total: number;
  mirrored: boolean;
  onNext: () => void;
  onRefresh: () => void;
};

// Rotates a child tree around (x, y) in POSE_RIG units using centered 0x0 wrapper.
function Pivot({
  x,
  y,
  rotate,
  translateY,
  children,
}: {
  x: number;
  y: number;
  rotate?: Animated.AnimatedInterpolation<string> | string;
  translateY?: Animated.AnimatedInterpolation<number> | number;
  children: React.ReactNode;
}) {
  const transforms: Record<string, unknown>[] = [];
  if (translateY !== undefined) transforms.push({ translateY });
  if (rotate !== undefined) transforms.push({ rotate });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x * SCALE,
        top: y * SCALE,
        width: 0,
        height: 0,
        transform: transforms.length > 0 ? (transforms as never) : undefined,
      }}
    >
      {children}
    </Animated.View>
  );
}

function Part({
  x,
  y,
  w,
  h,
  r,
  edge,
  fill = FILL,
  scaleY = 1,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  edge?: boolean;
  fill?: string;
  scaleY?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x * SCALE,
        top: y * SCALE,
        width: w * SCALE,
        height: h * SCALE,
        borderRadius: r * SCALE,
        backgroundColor: fill,
        borderWidth: edge ? 0.9 : 0,
        borderColor: edge ? EDGE : undefined,
        transform: scaleY !== 1 ? [{ scaleY }] : undefined,
      }}
    />
  );
}

export function PoseGuideOverlay({
  visible,
  phase,
  message,
  suggestion,
  index,
  total,
  mirrored,
  onNext,
  onRefresh,
}: Props) {
  const poseId: PoseId = suggestion?.id ?? DEFAULT_POSE;
  const poseDef: PoseDefinition = POSE_LIBRARY[poseId] ?? POSE_LIBRARY[DEFAULT_POSE];

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduceMotion(value);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const baseAnims = useRef<Record<PoseJoint, Animated.Value>>(
    Object.fromEntries(
      POSE_JOINTS.map((joint) => [joint, new Animated.Value(poseDef.joints[joint])]),
    ) as Record<PoseJoint, Animated.Value>,
  ).current;

  const idleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const targets = poseDef.joints;
    if (reduceMotion) {
      for (const joint of POSE_JOINTS) {
        baseAnims[joint].setValue(targets[joint]);
      }
      return;
    }
    const animations = POSE_JOINTS.map((joint) =>
      Animated.timing(baseAnims[joint], {
        toValue: targets[joint],
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    );
    const group = Animated.parallel(animations);
    group.start();
    return () => group.stop();
  }, [poseId, visible, reduceMotion, baseAnims, poseDef.joints]);

  useEffect(() => {
    idleAnim.setValue(0);
    if (!visible || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idleAnim, {
          toValue: 1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
          isInteraction: false,
        }),
        Animated.timing(idleAnim, {
          toValue: -1,
          duration: 1300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
          isInteraction: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, reduceMotion, idleAnim, poseId]);

  if (!visible) return null;

  const motion: Partial<PoseJoints> = { ...DEFAULT_MOTION, ...(poseDef.motion ?? {}) };
  const deg = (joint: PoseJoint) => {
    const amp = motion[joint] ?? 0;
    const val = amp
      ? Animated.add(baseAnims[joint], Animated.multiply(idleAnim, amp))
      : baseAnims[joint];
    return val.interpolate({
      inputRange: [-360, 360],
      outputRange: ['-360deg', '360deg'],
    });
  };

  const dropAmp = motion.drop ?? 0;
  const dropVal = dropAmp
    ? Animated.add(baseAnims.drop, Animated.multiply(idleAnim, dropAmp))
    : baseAnims.drop;
  const pelvisTranslateY = Animated.multiply(dropVal, SCALE);

  const R = POSE_RIG;
  const j = poseDef.joints;
  const thLenL = R.thigh.length * j.tlL;
  const thLenR = R.thigh.length * j.tlR;
  const uaLenL = R.upperArm.length * j.alL;
  const uaLenR = R.upperArm.length * j.alR;

  const loading = phase === 'waiting' || phase === 'analyzing';
  const title = loading
    ? 'AI 识别中…'
    : phase === 'error'
      ? '推荐未完成'
      : suggestion?.name ?? poseDef.name;
  const subtitle = loading
    ? message || '分析当前画面姿势'
    : phase === 'error'
      ? message || '点按切换 · 长按重试'
      : suggestion?.tip ?? poseDef.description;

  return (
    <Pressable
      testID="pose-guide-overlay"
      accessibilityRole="button"
      accessibilityLabel={`姿势引导：${title}。${subtitle}。点击切换姿势，长按重新推荐`}
      onPress={onNext}
      onLongPress={onRefresh}
      delayLongPress={380}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.topBar}>
        <View style={styles.badge}>
          <Ionicons name="body-outline" size={10} color={colors.secondaryFixed} />
          <Text style={styles.badgeText}>
            {total > 1 ? `姿势 ${index + 1}/${total}` : 'AI 姿势'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重新推荐姿势"
          hitSlop={6}
          onPress={onRefresh}
          style={styles.refreshBtn}
        >
          {loading ? (
            <ActivityIndicator size={10} color={colors.secondaryFixed} />
          ) : (
            <Ionicons name="refresh" size={11} color="#E4E2DF" />
          )}
        </Pressable>
      </View>

      <View
        style={[
          styles.figureStage,
          { width: FIG_W, height: FIG_H },
          mirrored && { transform: [{ scaleX: -1 }] },
        ]}
      >
        {/* Ground shadow */}
        <Part
          x={R.pelvis.x - R.ground.width / 2}
          y={R.ground.y - R.ground.height / 2}
          w={R.ground.width}
          h={R.ground.height}
          r={R.ground.height / 2}
          fill="rgba(0, 0, 0, 0.28)"
        />

        {/* Scene prop hints */}
        {poseDef.prop === 'wall' && (
          <Part
            x={R.wall.x}
            y={R.wall.top}
            w={R.wall.width}
            h={R.ground.y - R.wall.top}
            r={1}
            fill={PROP_COLOR}
          />
        )}
        {poseDef.prop === 'seat' && (
          <>
            <Part
              x={R.pelvis.x - R.seat.width / 2}
              y={R.pelvis.y + j.drop + R.seat.gap}
              w={R.seat.width}
              h={R.seat.plank}
              r={1.5}
              fill={PROP_COLOR}
            />
            <Part
              x={R.pelvis.x - R.seat.width / 2 + 3}
              y={R.pelvis.y + j.drop + R.seat.gap + R.seat.plank}
              w={R.seat.leg}
              h={R.ground.y - (R.pelvis.y + j.drop + R.seat.gap + R.seat.plank)}
              r={1}
              fill={PROP_COLOR}
            />
            <Part
              x={R.pelvis.x + R.seat.width / 2 - 3 - R.seat.leg}
              y={R.pelvis.y + j.drop + R.seat.gap + R.seat.plank}
              w={R.seat.leg}
              h={R.ground.y - (R.pelvis.y + j.drop + R.seat.gap + R.seat.plank)}
              r={1}
              fill={PROP_COLOR}
            />
          </>
        )}

        {/* Pelvis root */}
        <Pivot x={R.pelvis.x} y={R.pelvis.y} translateY={pelvisTranslateY}>
          {/* Left Leg */}
          <Pivot x={-R.hipX} y={0} rotate={deg('thL')}>
            <Part
              x={-R.thigh.width / 2}
              y={R.thigh.top}
              w={R.thigh.width}
              h={thLenL + R.thigh.extra}
              r={R.thigh.width / 2}
            />
            <Pivot x={0} y={thLenL} rotate={deg('shL')}>
              <Part
                x={-R.shin.width / 2}
                y={R.shin.top}
                w={R.shin.width}
                h={R.shin.length + R.shin.extra}
                r={R.shin.width / 2}
              />
              <Part
                x={-R.foot.width + R.foot.inset}
                y={R.shin.length + R.foot.top}
                w={R.foot.width}
                h={R.foot.height}
                r={R.foot.height / 2}
              />
            </Pivot>
          </Pivot>

          {/* Right Leg */}
          <Pivot x={R.hipX} y={0} rotate={deg('thR')}>
            <Part
              x={-R.thigh.width / 2}
              y={R.thigh.top}
              w={R.thigh.width}
              h={thLenR + R.thigh.extra}
              r={R.thigh.width / 2}
            />
            <Pivot x={0} y={thLenR} rotate={deg('shR')}>
              <Part
                x={-R.shin.width / 2}
                y={R.shin.top}
                w={R.shin.width}
                h={R.shin.length + R.shin.extra}
                r={R.shin.width / 2}
              />
              <Part
                x={-R.foot.inset}
                y={R.shin.length + R.foot.top}
                w={R.foot.width}
                h={R.foot.height}
                r={R.foot.height / 2}
              />
            </Pivot>
          </Pivot>

          {/* Torso + Head + Arms */}
          <Pivot x={0} y={0} rotate={deg('lean')}>
            {R.torso.map((seg, idx) => (
              <Part key={idx} x={seg.x} y={seg.y} w={seg.w} h={seg.h} r={seg.r} />
            ))}

            {/* Neck & Head */}
            <Pivot x={0} y={R.neckPivot} rotate={deg('head')}>
              <Part
                x={R.neck.x}
                y={R.neck.y}
                w={R.neck.w}
                h={R.neck.h}
                r={R.neck.r}
              />
              <Part
                x={-R.head.width / 2}
                y={R.head.centerY - R.head.width / 2}
                w={R.head.width}
                h={R.head.width}
                r={R.head.width / 2}
                scaleY={R.head.height / R.head.width}
              />
            </Pivot>

            {/* Left Arm */}
            <Pivot x={-R.shoulderX} y={R.shoulderY} rotate={deg('uaL')}>
              <Part
                x={-R.upperArm.width / 2}
                y={R.upperArm.top}
                w={R.upperArm.width}
                h={uaLenL + R.upperArm.extra}
                r={R.upperArm.width / 2}
                edge
              />
              <Pivot x={0} y={uaLenL} rotate={deg('faL')}>
                <Part
                  x={-R.forearm.width / 2}
                  y={R.forearm.top}
                  w={R.forearm.width}
                  h={R.forearm.length + R.forearm.extra}
                  r={R.forearm.width / 2}
                  edge
                />
                <Part
                  x={-R.hand.width / 2}
                  y={R.forearm.length + R.hand.offset - R.hand.height / 2}
                  w={R.hand.width}
                  h={R.hand.height}
                  r={R.hand.width / 2}
                />
              </Pivot>
            </Pivot>

            {/* Right Arm */}
            <Pivot x={R.shoulderX} y={R.shoulderY} rotate={deg('uaR')}>
              <Part
                x={-R.upperArm.width / 2}
                y={R.upperArm.top}
                w={R.upperArm.width}
                h={uaLenR + R.upperArm.extra}
                r={R.upperArm.width / 2}
                edge
              />
              <Pivot x={0} y={uaLenR} rotate={deg('faR')}>
                <Part
                  x={-R.forearm.width / 2}
                  y={R.forearm.top}
                  w={R.forearm.width}
                  h={R.forearm.length + R.forearm.extra}
                  r={R.forearm.width / 2}
                  edge
                />
                <Part
                  x={-R.hand.width / 2}
                  y={R.forearm.length + R.hand.offset - R.hand.height / 2}
                  w={R.hand.width}
                  h={R.hand.height}
                  r={R.hand.width / 2}
                />
              </Pivot>
            </Pivot>
          </Pivot>
        </Pivot>
      </View>

      <View style={styles.captionWrap}>
        <Text style={styles.poseName} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.poseTip} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 96,
    paddingTop: 6,
    paddingBottom: 7,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(28, 25, 22, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(254, 221, 132, 0.38)',
    alignItems: 'center',
    zIndex: 14,
    ...shadows.glassSm,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  badgeText: {
    color: colors.secondaryFixed,
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  refreshBtn: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  figureStage: {
    position: 'relative',
    overflow: 'hidden',
  },
  captionWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 2,
    gap: 1,
  },
  poseName: {
    color: '#FBF4E4',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  poseTip: {
    color: 'rgba(251, 244, 228, 0.78)',
    fontSize: 8,
    lineHeight: 10.5,
    fontWeight: '500',
    textAlign: 'center',
  },
});
