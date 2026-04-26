// Plan 04-01 D-06/D-10 — ActionButton. Single-flight async lock; offline-aware;
// rate-limit countdown. Surfaces thrown errors via useStore.toast.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, ActivityIndicator, View, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { useStore } from '../stores/useStore';

function extractMessage(err: any): string {
  return (
    err?.response?.data?.message ||
    err?.message ||
    'Произошла ошибка'
  );
}
function extractRid(err: any): string | undefined {
  return err?.response?.data?.requestId;
}

function formatMMSS(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface RateLimitCountdownProps {
  until: number;
  endpointKey: string;
}

function RateLimitCountdown({ until, endpointKey }: RateLimitCountdownProps) {
  const [now, setNow] = useState(Date.now());
  const clear = useStore((s) => s.clearRateLimit);

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) {
        clearInterval(id);
        clear(endpointKey);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [until, endpointKey, clear]);

  const remaining = until - now;
  if (remaining <= 0) return null;
  return (
    <Text style={styles.countdown}>{`Повторите через ${formatMMSS(remaining)}`}</Text>
  );
}

export interface ActionButtonProps {
  onPress: () => Promise<void> | void;
  label: string;
  busyLabel?: string;
  endpointKey?: string;
  isDestructive?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function ActionButton({
  onPress,
  label,
  busyLabel,
  endpointKey,
  isDestructive,
  disabled,
  testID,
}: ActionButtonProps) {
  const [busy, setBusy] = useState(false);
  const inflight = useRef<Promise<unknown> | null>(null);
  const isOnline = useStore((s) => s.network.isOnline);
  const rl = useStore((s) => (endpointKey ? s.rateLimit[endpointKey] : undefined));
  const scale = useSharedValue(1);

  const blockedByRate = !!rl && rl.until > Date.now();
  const blockedByOffline = !isOnline;
  const isDisabled = disabled || blockedByOffline || blockedByRate || busy;

  const handlePress = useCallback(async () => {
    if (inflight.current) return;
    setBusy(true);
    inflight.current = (async () => {
      try {
        await onPress();
      } catch (err) {
        try {
          useStore.getState().toast.show(extractMessage(err), 'error', {
            requestId: extractRid(err),
          });
        } catch {
          // toast may not be ready in some test envs
        }
      } finally {
        setBusy(false);
        inflight.current = null;
      }
    })();
    await inflight.current;
  }, [onPress]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg = isDestructive ? '#ef4444' : '#4F8EF7';

  let displayLabel = label;
  if (busy && busyLabel) displayLabel = busyLabel;
  else if (blockedByOffline) displayLabel = 'Нет связи';

  return (
    <View>
      <Animated.View style={animStyle}>
        <Pressable
          onPress={handlePress}
          disabled={isDisabled}
          onPressIn={() => {
            scale.value = withTiming(0.97, { duration: 80 });
          }}
          onPressOut={() => {
            scale.value = withTiming(1, { duration: 120 });
          }}
          style={[
            styles.btn,
            { backgroundColor: bg, opacity: isDisabled ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={displayLabel}
          accessibilityState={{ disabled: isDisabled, busy }}
          testID={testID}
        >
          {busy ? <ActivityIndicator color="#fff" /> : null}
          <Text style={styles.label}>{displayLabel}</Text>
        </Pressable>
      </Animated.View>
      {blockedByRate && endpointKey && rl ? (
        <RateLimitCountdown until={rl.until} endpointKey={endpointKey} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.base,
    ...Shadows.primary,
  },
  label: {
    fontSize: 15,
    fontFamily: 'Manrope-ExtraBold',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  countdown: {
    fontSize: Fonts.sizes.sm,
    fontFamily: 'Manrope-Medium',
    color: '#64748b',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});

export default ActionButton;
