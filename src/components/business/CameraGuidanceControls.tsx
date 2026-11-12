import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/theme';
import type { GuidanceStatus } from '../../types/guidance';

type Props = {
  enabled: boolean; starting: boolean; disabled: boolean; autoZoom: boolean;
  status: GuidanceStatus; configMissing: boolean;
  onToggle: () => void; onAutoZoom: () => void; onRefresh: () => void; onConfigure: () => void;
  poseEnabled?: boolean; poseStarting?: boolean; poseWorking?: boolean;
  poseError?: string; poseConfigMissing?: boolean;
  onTogglePose?: () => void;
};

export function CameraGuidanceControls(props: Props) {
  const working = props.starting || props.status.phase === 'sampling' || props.status.phase === 'analyzing';
  const showError = props.status.phase === 'error' || Boolean(props.poseError);
  const statusText = props.status.phase === 'error'
    ? props.status.message
    : props.poseError || props.status.message;
  const needConfig = props.configMissing || Boolean(props.poseConfigMissing);
  return <View style={styles.container}>
    <View style={styles.row}>
      <Pressable accessibilityRole="switch" accessibilityLabel="AI 拍摄指导" accessibilityState={{ checked: props.enabled }}
        disabled={props.disabled || props.starting} onPress={props.onToggle} style={[styles.button, props.enabled && styles.selected]}>
        {working ? <ActivityIndicator size="small" color={colors.secondaryFixed} /> : <Ionicons name="sparkles-outline" size={14} color={props.enabled ? colors.secondaryFixed : colors.onSurfaceVariant} />}
        <Text style={[styles.text, props.enabled && styles.textSelected]}>{props.starting ? '连接中' : `AI 指导${props.enabled ? ' 开' : ' 关'}`}</Text>
      </Pressable>
      <Pressable accessibilityRole="switch" accessibilityLabel="自动变焦" accessibilityState={{ checked: props.autoZoom }}
        disabled={props.disabled} onPress={props.onAutoZoom} style={[styles.button, props.autoZoom && styles.selected]}>
        <Ionicons name="scan-outline" size={14} color={props.autoZoom ? colors.secondaryFixed : colors.onSurfaceVariant} />
        <Text style={[styles.text, props.autoZoom && styles.textSelected]}>自动变焦{props.autoZoom ? ' 开' : ' 关'}</Text>
      </Pressable>
      {props.onTogglePose && (
        <Pressable accessibilityRole="switch" accessibilityLabel="姿势指引" accessibilityState={{ checked: Boolean(props.poseEnabled) }}
          disabled={props.disabled || props.poseStarting} onPress={props.onTogglePose} style={[styles.button, props.poseEnabled && styles.selected]}>
          {props.poseStarting || props.poseWorking
            ? <ActivityIndicator size="small" color={colors.secondaryFixed} />
            : <Ionicons name="body-outline" size={14} color={props.poseEnabled ? colors.secondaryFixed : colors.onSurfaceVariant} />}
          <Text style={[styles.text, props.poseEnabled && styles.textSelected]}>{props.poseStarting ? '连接中' : `姿势指引${props.poseEnabled ? ' 开' : ' 关'}`}</Text>
        </Pressable>
      )}
      {props.enabled && <Pressable accessibilityRole="button" accessibilityLabel="重新规划" disabled={props.disabled || working}
        onPress={props.onRefresh} style={styles.button}><Ionicons name="refresh-outline" size={15} color={colors.onSurfaceVariant} /><Text style={styles.text}>重新规划</Text></Pressable>}
    </View>
    {(props.enabled || showError) && <Text testID="guidance-request-status" accessibilityLiveRegion="polite"
      style={showError ? styles.error : styles.status}>{statusText}</Text>}
    {needConfig && <Pressable accessibilityRole="button" onPress={props.onConfigure} style={styles.configButton}>
      <Text style={styles.configText}>前往 AI 配置</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6 },
  button: { minHeight: 30, paddingHorizontal: 11, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfaceContainer },
  selected: { backgroundColor: colors.primary },
  text: { fontSize: 10, color: colors.onSurfaceVariant, fontWeight: '600', letterSpacing: 0.3 },
  textSelected: { color: colors.secondaryFixed },
  error: { fontSize: 10, lineHeight: 14, textAlign: 'center', color: '#93000A', marginTop: 2, backgroundColor: '#FFDAD6', borderRadius: 8, padding: 6 },
  status: { fontSize: 9.5, lineHeight: 13, textAlign: 'center', color: colors.onSurfaceVariant, marginTop: 2, opacity: 0.85 },
  configButton: { alignSelf: 'center', minHeight: 28, justifyContent: 'center', paddingHorizontal: 10 },
  configText: { color: colors.secondary, fontSize: 11, fontWeight: '600' },
});
