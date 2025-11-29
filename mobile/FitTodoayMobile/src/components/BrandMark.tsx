import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface BrandMarkProps {
  size?: 'sm' | 'md';
}

export function BrandMark({ size = 'md' }: BrandMarkProps) {
  const small = size === 'sm';
  return (
    <View style={[styles.container, small && styles.containerSm]}>
      <Text style={[styles.fit, small && styles.fitSm]}>F I T</Text>
      <View style={[styles.row, small && styles.rowSm]}>
        <Text style={[styles.tod, small && styles.todSm]}>TOD</Text>
        <View style={[styles.icon, small && styles.iconSm]}>
          <View style={[styles.iconRing, small && styles.iconRingSm]} />
          <Text style={[styles.iconCheck, small && styles.iconCheckSm]}>✓</Text>
        </View>
        <Text style={[styles.ay, small && styles.aySm]}>AY</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
    color: colors.text,
  },
  containerSm: {
    gap: 4,
  },
  fit: {
    letterSpacing: 6,
    textTransform: 'uppercase',
    color: colors.muted,
    fontFamily: 'Inter-Regular',
    fontSize: 12,
  },
  fitSm: {
    fontSize: 10,
    letterSpacing: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowSm: {
    gap: 3,
  },
  tod: {
    color: colors.muted,
    letterSpacing: -0.5,
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  todSm: {
    fontSize: 13,
  },
  ay: {
    color: colors.muted,
    letterSpacing: -0.5,
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  aySm: {
    fontSize: 13,
  },
  icon: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSm: {
    width: 14,
    height: 14,
    borderWidth: 1.3,
  },
  iconRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.primary,
    opacity: 0.8,
  },
  iconRingSm: {
    borderWidth: 1.3,
  },
  iconCheck: {
    color: colors.primary,
    fontSize: 10,
    fontFamily: 'Inter-Bold',
  },
  iconCheckSm: {
    fontSize: 8,
  },
});
