import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows } from '../../constants/theme';

type Props = {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap | null;
  onPress?: () => void;
};

export function PageHeader({ title, icon = 'options-outline', onPress }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="camera-outline" size={29} color={colors.primary} />
        </View>
        <View style={styles.brandText}>
          <Text style={styles.brandName} numberOfLines={1}>Drama相机</Text>
          <Text style={styles.brandSub} numberOfLines={1}>{title}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {icon && (onPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="页面操作"
            onPress={onPress}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name={icon} size={21} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : (
          <View style={styles.iconButton}>
            <Ionicons name={icon} size={21} color={colors.onSurfaceVariant} />
          </View>
        ))}

        <View style={styles.avatarWrap}>
          <Image
            source={require('../../../assets/editorial/editorial_3.jpg')}
            style={styles.avatar}
          />
          <View pointerEvents="none" style={styles.avatarRing} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  logo: {
    width: 30,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    justifyContent: 'center',
    flexShrink: 1,
  },
  brandName: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  brandSub: {
    color: colors.onSurfaceVariant,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.surfaceContainer,
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    ...shadows.glassSm,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(254, 221, 132, 0.55)',
  },
});
