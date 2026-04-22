import React, { useEffect, useState, useRef } from 'react';
import { View, AppState, StyleSheet, Platform, AppStateStatus } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useStore } from '../stores/useStore';
import { Colors } from '../constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

export default function BiometricGuard({ children }: { children: React.ReactNode }) {
  const { token } = useStore();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const appStateRef = useRef(appState);

  // Re-verify on foreground if they have a token
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        if (token && !isUnlocked) {
          authenticate();
        }
      }
      if (nextAppState.match(/inactive|background/)) {
        setIsUnlocked(false);
      }
      appStateRef.current = nextAppState;
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [token, isUnlocked]);

  // Initial Check
  useEffect(() => {
    if (token && appState === 'active' && !isUnlocked) {
      authenticate();
    }
  }, [token, appState]);

  const authenticate = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Подтвердите личность',
        fallbackLabel: 'Использовать ПИН-код',
      });
      if (result.success) {
        setIsUnlocked(true);
      }
    } else {
      // If biometrics are unsupported or unenrolled natively on Simulator environments
      setIsUnlocked(true);
    }
  };

  // Only lock if we actually have a logged-in User Token context
  if (token && (!isUnlocked || appState !== 'active')) {
    return (
      <View style={styles.blurContainer}>
        {/* Render actual App Behind the blur but physically covered */}
        <View style={styles.hiddenChildren}>{children}</View>
        <Animated.View exiting={FadeOut} entering={FadeIn} style={[StyleSheet.absoluteFill, styles.overlay]}>
          <MaterialIcons name="lock-outline" size={64} color={Colors.primary} />
        </Animated.View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  blurContainer: { flex: 1, backgroundColor: '#000' },
  hiddenChildren: { flex: 1, opacity: 0 },
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  }
});
