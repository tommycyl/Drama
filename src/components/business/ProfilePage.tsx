import React, { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, shadows } from '../../constants/theme';
import { CAMERA_STYLES } from '../../constants/guidance';
import { useCaptureStore } from '../../store/captureStore';
import { PageHeader } from '../ui/PageHeader';

const utilities = [
  { title: 'AI 配置', icon: 'options-outline' },
  { title: '我的作品', icon: 'images-outline' },
  { title: '收藏的灵感', icon: 'heart-outline' },
  { title: '拍摄统计', icon: 'bar-chart-outline' },
  { title: '意见反馈', icon: 'mail-outline' },
  { title: '关于Drama相机', icon: 'information-circle-outline' },
] as const;

const ABOUT_TEXT = 'AI相机应用，实时在取景框AI提示，为了解决很多人拍照找不到机位和相机参数，为了让每个人都能快乐的拍照，为了男生能给女朋友美美拍照。只希望这个小小的应用能解决一点你的问题';

export function ProfilePage() {
  const router = useRouter();
  const [dialog, setDialog] = useState<'feedback' | 'about' | null>(null);
  const closeDialog = () => setDialog(null);
  const savedCount = useCaptureStore((state) => state.savedUris.length);
  const favoriteCount = useCaptureStore((state) => state.favoriteUris.length);
  const styleCount = Object.keys(CAMERA_STYLES).length;

  const openUtility = (title: string) => {
    if (title === 'AI 配置') {
      router.push('/settings/ai');
    } else if (title === '我的作品' || title === '收藏的灵感') {
      router.navigate('/album');
    } else if (title === '意见反馈') {
      setDialog('feedback');
    } else if (title === '关于Drama相机') {
      setDialog('about');
    } else {
      Alert.alert(title, '这个入口会在下一版开放。');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.fixedHeader}>
        <PageHeader title="设置" icon={null} />
      </View>

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* ── Curator profile card ── */}
        <View style={styles.heroCard}>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255, 224, 142, 0.34)', 'rgba(255, 224, 142, 0)']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0.15, y: 1 }}
            style={styles.heroGlow}
          />

          <View style={styles.heroTop}>
            <View style={styles.avatarWrap}>
              <Image
                source={require('../../../assets/editorial/editorial_3.jpg')}
                style={styles.avatar}
              />
            </View>

            <View style={styles.heroInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>摄影师</Text>
              </View>
              <Text style={styles.heroDesc} numberOfLines={1}>摄影创作者</Text>
              <View style={styles.cloudRow}>
                <Ionicons name="cloud-done-outline" size={13} color={colors.tertiary} />
                <Text style={styles.cloudText}>DRAMA CLOUD</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{savedCount}</Text>
              <Text style={styles.statLabel}>已保存作品</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, styles.statValueGold]}>{favoriteCount}</Text>
              <Text style={styles.statLabel}>我的收藏</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{styleCount}</Text>
              <Text style={styles.statLabel}>拍摄风格</Text>
            </View>
          </View>
        </View>

        {/* ── Utilities ── */}
        <View style={styles.utilityCard}>
          {utilities.map((item, index) => (
            <Pressable
              key={item.title}
              accessibilityRole="button"
              onPress={() => openUtility(item.title)}
              style={({ pressed }) => [
                styles.utilityRow,
                index === utilities.length - 1 && styles.utilityRowLast,
                pressed && styles.utilityRowPressed,
              ]}
            >
              <View style={styles.utilityLeft}>
                <Ionicons
                  name={item.icon}
                  size={19}
                  color={colors.onSurfaceVariant}
                />
                <Text style={styles.utilityText} numberOfLines={1}>{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.onSurfaceVariant} />
            </Pressable>
          ))}
        </View>

        <View style={styles.buildFooter}>
          <Text style={styles.buildText}>Drama相机 · MIT License · © 2026 Tommy_Cui</Text>
        </View>
      </ScrollView>

      <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={closeDialog}>
        {dialog && (
          <SafeAreaView style={styles.dialogBackdrop} edges={['top', 'bottom']}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="关闭弹窗" onPress={closeDialog} />
            <View style={styles.dialogCard} accessibilityViewIsModal>
              <View style={styles.dialogHeader}>
                <View style={styles.dialogIcon}>
                  <Ionicons name={dialog === 'feedback' ? 'mail-outline' : 'camera-outline'} size={24} color={colors.secondary} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={closeDialog} style={styles.dialogClose}>
                  <Ionicons name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>
              <Text accessibilityRole="header" style={styles.dialogTitle}>{dialog === 'feedback' ? '意见反馈' : '关于Drama相机'}</Text>
              <ScrollView style={styles.dialogBody} contentContainerStyle={styles.dialogBodyContent}>
                {dialog === 'feedback' ? (
                  <>
                    <Text style={styles.dialogDescription}>欢迎把你的建议或使用中遇到的问题发送到邮箱：</Text>
                    <View style={styles.emailCard}>
                      <Text selectable style={styles.emailAddress}>tommy_cui@foxmail.com</Text>
                    </View>
                  </>
                ) : (
                  <Text selectable style={styles.dialogDescription}>{ABOUT_TEXT}</Text>
                )}
              </ScrollView>
              <Pressable accessibilityRole="button" onPress={closeDialog} style={({ pressed }) => [styles.dialogConfirm, pressed && styles.dialogConfirmPressed]}>
                <Text style={styles.dialogConfirmText}>知道了</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  dialogBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    backgroundColor: 'rgba(24, 22, 18, 0.42)',
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 24,
    ...shadows.glassLg,
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  dialogIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.butterWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogClose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surfaceContainer,
  },
  dialogTitle: {
    color: colors.primary,
    fontSize: 21,
    fontWeight: '600',
    marginBottom: 14,
  },
  dialogBody: {
    flexGrow: 0,
    flexShrink: 1,
  },
  dialogBodyContent: {
    paddingBottom: 4,
  },
  dialogDescription: {
    color: colors.onSurfaceVariant,
    fontSize: 14,
    lineHeight: 26,
  },
  emailCard: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 16,
  },
  emailAddress: {
    color: colors.primary,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '600',
  },
  dialogConfirm: {
    marginTop: 24,
    minHeight: 48,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 24,
  },
  dialogConfirmPressed: {
    opacity: 0.8,
  },
  dialogConfirmText: {
    color: colors.whiteWarm,
    fontSize: 14,
    fontWeight: '600',
  },
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  fixedHeader: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: 'rgba(251, 249, 246, 0.92)',
    zIndex: 100,
    borderBottomWidth: 1,
    borderColor: 'rgba(45, 42, 38, 0.04)',
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 120,
    gap: 20,
  },

  /* hero */
  heroCard: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: 28,
    padding: 18,
    overflow: 'hidden',
    ...shadows.glassMd,
  },
  heroGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '70%',
    height: '80%',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 2,
  },
  avatarWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    position: 'relative',
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    color: colors.primary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  heroDesc: {
    color: colors.onSurfaceVariant,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  cloudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  cloudText: {
    color: colors.tertiary,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.9,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceLow,
    zIndex: 2,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  statValue: {
    color: colors.primary,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  statValueGold: {
    color: colors.secondary,
  },
  statLabel: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  /* utilities */
  utilityCard: {
    backgroundColor: colors.surfaceLowest,
    borderRadius: 24,
    overflow: 'hidden',
    ...shadows.glassSm,
  },
  utilityRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: 'rgba(45, 42, 38, 0.05)',
    gap: 8,
  },
  utilityRowLast: {
    borderBottomWidth: 0,
  },
  utilityRowPressed: {
    backgroundColor: colors.surfaceLow,
  },
  utilityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  utilityText: {
    color: colors.primary,
    fontSize: 13.5,
    fontWeight: '400',
    flexShrink: 1,
  },
  buildFooter: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  buildText: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '500',
    opacity: 0.7,
    letterSpacing: 0.5,
  },
});
