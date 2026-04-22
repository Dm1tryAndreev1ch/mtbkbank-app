import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, withDelay, withSequence, interpolate, Extrapolation, runOnJS
} from 'react-native-reanimated';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Fonts, Spacing, BorderRadius, Shadows, getRarityName } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';

const { width, height } = Dimensions.get('window');

interface CardDropRevealProps {
  card: any;
  onDismiss: () => void;
  onEquip?: () => void;
}

export default function CardDropReveal({ card, onDismiss, onEquip }: CardDropRevealProps) {
  const colors = useThemeColor();

  // Animation values
  const bgOpacity = useSharedValue(0);
  const orbTranslateY = useSharedValue(200);
  const orbScale = useSharedValue(0.1);
  const cardRotateY = useSharedValue(0); // 0 to 1
  const cardScale = useSharedValue(0.2);
  const cardTranslateY = useSharedValue(100);
  const burstOpacity = useSharedValue(0);
  const burstScale = useSharedValue(0.5);
  const detailsOpacity = useSharedValue(0);
  const detailsTranslateY = useSharedValue(20);

  const [phase, setPhase] = useState<'IDLE' | 'DROP' | 'REVEAL' | 'DONE'>('IDLE');

  const c = card?.collectionCard || card;
  const rarity = c?.rarity || 'COMMON';

  const getRarityCol = (r: string) => {
    switch (r) {
      case 'COMMON': return colors.rarityCommon;
      case 'RARE': return colors.rarityRare;
      case 'EPIC': return colors.rarityEpic;
      case 'LEGENDARY': return colors.rarityLegendary;
      default: return colors.rarityCommon;
    }
  };

  const rarityColor = getRarityCol(rarity);

  const triggerHaptics = (rarityType: string) => {
    if (rarityType === 'LEGENDARY') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (rarityType === 'EPIC') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (rarityType === 'RARE') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  useEffect(() => {
    // Stage 1: Dark Overlay & Orbital Rise (0.0s -> 0.5s)
    bgOpacity.value = withTiming(1, { duration: 500 });
    orbTranslateY.value = withTiming(0, { duration: 600 });
    orbScale.value = withSpring(1, { damping: 12 });
    cardTranslateY.value = withTiming(0, { duration: 600 });
    cardScale.value = withSpring(0.8, { damping: 14 });

    // Stage 2: The Flip Reveal (0.6s -> 1.2s)
    setTimeout(() => {
       setPhase('REVEAL');
       cardRotateY.value = withSpring(1, { damping: 14, stiffness: 60 });
       cardScale.value = withSequence(
         withTiming(1.1, { duration: 300 }),
         withSpring(1, { damping: 10 })
       );
    }, 600);

    // Stage 3: The Burst (1.2s)
    setTimeout(() => {
      burstOpacity.value = withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 500 }));
      burstScale.value = withTiming(2.5, { duration: 400 });
      runOnJS(triggerHaptics)(rarity);
    }, 1200);

    // Stage 4: Details & Actions Fade In (1.6s)
    setTimeout(() => {
       setPhase('DONE');
       detailsOpacity.value = withTiming(1, { duration: 400 });
       detailsTranslateY.value = withTiming(0, { duration: 400 });
    }, 1600);

  }, []);

  const bgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
    backgroundColor: 'rgba(0,0,0,0.85)'
  }));

  const cardContainerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: cardTranslateY.value },
      { scale: cardScale.value }
    ]
  }));

  const cardFrontStyle = useAnimatedStyle(() => {
    const rotate = interpolate(cardRotateY.value, [0, 1], [180, 360], Extrapolation.CLAMP);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotate}deg` }],
      backfaceVisibility: 'hidden',
    };
  });

  const cardBackStyle = useAnimatedStyle(() => {
    const rotate = interpolate(cardRotateY.value, [0, 1], [0, 180], Extrapolation.CLAMP);
    return {
      transform: [{ perspective: 1000 }, { rotateY: `${rotate}deg` }],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
    };
  });

  const burstStyle = useAnimatedStyle(() => ({
     opacity: burstOpacity.value,
     transform: [{ scale: burstScale.value }]
  }));

  const detailsStyle = useAnimatedStyle(() => ({
     opacity: detailsOpacity.value,
     transform: [{ translateY: detailsTranslateY.value }]
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.container]}>
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} />

      <Animated.View style={[styles.burstEffect, { backgroundColor: rarityColor }, burstStyle]} />

      <View style={styles.centerStage}>
        {phase === 'DONE' && (
           <Animated.Text style={[styles.celebrationText, { color: rarityColor }, detailsStyle]}>
              {rarity === 'LEGENDARY' ? 'ЛЕГЕНДАРНАЯ КАРТА!' : rarity === 'EPIC' ? 'ЭПИЧЕСКАЯ КАРТА!' : 'НОВАЯ КАРТА!'}
           </Animated.Text>
        )}

        <Animated.View style={[styles.cardWrapper, cardContainerStyle]}>
          {/* Back of Card */}
          <Animated.View style={[styles.cardSurface, styles.cardBack, { borderColor: colors.outlineVariant }, cardBackStyle]}>
             <MaterialIcons name="monetization-on" size={64} color={colors.outlineVariant} />
          </Animated.View>

          {/* Front of Card */}
          <Animated.View style={[styles.cardSurface, { borderColor: rarityColor, backgroundColor: colors.surfaceContainerLowest }, cardFrontStyle]}>
            <View style={[styles.glowOverlay, { backgroundColor: rarityColor }]} />
            
            <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
                <Text style={styles.rarityBadgeText}>{getRarityName(rarity)}</Text>
            </View>

            <View style={styles.cardItemIcon}>
                <MaterialIcons name={(c?.brandIcon as any) || 'style'} size={48} color={rarityColor} />
            </View>

            <Text style={styles.cardName}>{c?.name || 'Неизвестно'}</Text>
            <Text style={styles.cardBrand}>{c?.brandName || 'Банк'}</Text>

            <View style={styles.cardStats}>
               <View style={styles.statRow}>
                  <MaterialIcons name="favorite" size={14} color="#22c55e" />
                  <Text style={styles.statText}>100%</Text>
               </View>
               <View style={styles.statRow}>
                  <MaterialIcons name="percent" size={14} color={colors.primary} />
                  <Text style={styles.statText}>{c?.cashbackPercent || 0}%</Text>
               </View>
            </View>
          </Animated.View>
        </Animated.View>

        <Animated.View style={[styles.actionsContainer, detailsStyle]}>
           <Text style={styles.instructionText}>Эта карта добавлена в вашу коллекцию.</Text>
           <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => {
              if(onEquip) onEquip();
              else onDismiss();
           }}>
              <Text style={styles.buttonText}>Экипировать сейчас</Text>
           </TouchableOpacity>
           <TouchableOpacity style={[styles.button, styles.buttonSecondary, { borderColor: colors.outlineVariant }]} onPress={onDismiss}>
              <Text style={[styles.buttonText, { color: colors.onSurface }]}>Закрыть</Text>
           </TouchableOpacity>
        </Animated.View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'center',
    alignItems: 'center'
  },
  centerStage: {
    width: width,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl
  },
  burstEffect: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 20
  },
  celebrationText: {
    fontSize: 24,
    fontFamily: 'Manrope-ExtraBold',
    textAlign: 'center',
    marginBottom: 40,
    letterSpacing: -0.5,
    textTransform: 'uppercase'
  },
  cardWrapper: {
    width: 220,
    height: 320,
    position: 'relative'
  },
  cardSurface: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.xl,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    ...Shadows.xl,
    overflow: 'hidden'
  },
  cardBack: {
    backgroundColor: '#1E293B',
  },
  glowOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 6,
    opacity: 0.8
  },
  rarityBadge: {
    position: 'absolute',
    top: 12, left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  rarityBadgeText: {
    fontSize: 10,
    fontFamily: 'Manrope-ExtraBold',
    color: '#131313',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  cardItemIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(128,128,128,0.1)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginVertical: 12,
  },
  cardName: {
    fontSize: 20, fontFamily: 'Manrope-ExtraBold', color: '#fff', textAlign: 'center'
  },
  cardBrand: {
    fontSize: 14, color: '#94a3b8', textAlign: 'center', fontFamily: 'Manrope-Medium', marginTop: 4
  },
  cardStats: {
    flexDirection: 'row', justifyContent: 'space-around', width: '100%',
    marginTop: 'auto', paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)'
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 14, fontFamily: 'Manrope-Bold', color: '#cbd5e1' },

  actionsContainer: {
    marginTop: 60,
    width: '100%',
    gap: Spacing.md
  },
  instructionText: {
    color: '#94a3b8',
    fontFamily: 'Manrope-Medium',
    textAlign: 'center',
    marginBottom: 8
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    ...Shadows.md
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2
  },
  buttonText: {
    color: '#fff',
    fontFamily: 'Manrope-ExtraBold',
    fontSize: 16
  }
});
