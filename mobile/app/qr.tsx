import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { useStore } from '../stores/useStore';
import { Fonts, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { useThemeColor } from '../hooks/useThemeColor';

const SCAN_SIZE = Dimensions.get('window').width * 0.7;

export default function QRScreen() {
  const [tab, setTab] = useState<'scan' | 'myqr'>('scan');
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const { user, accounts } = useStore();
  const colors = useThemeColor();
  const s = useMemo(() => mk(colors), [colors]);
  const acc = accounts.find((a: any) => a.type === 'main') || accounts[0];

  // Анимация линии сканирования
  const scanLineY = useSharedValue(0);
  useEffect(() => {
    scanLineY.value = withRepeat(
      withSequence(
        withTiming(SCAN_SIZE - 4, { duration: 1800 }),
        withTiming(0, { duration: 1800 }),
      ),
      -1,
      false,
    );
  }, []);
  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
  }));

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(100);

    // Обработка QR данных
    // Формат: mtbk://transfer?to=CARD&amount=500
    if (data.startsWith('mtbk://transfer')) {
      const url = new URL(data.replace('mtbk://', 'https://mtbk/'));
      const to = url.searchParams.get('to');
      const amount = url.searchParams.get('amount');
      Alert.alert(
        'Перевод',
        `Получатель: ${to}${amount ? `\nСумма: ${amount} ₽` : ''}`,
        [
          { text: 'Отмена', onPress: () => setScanned(false), style: 'cancel' },
          {
            text: 'Перейти к переводу',
            onPress: () => router.replace({ pathname: '/transfer', params: { to: to ?? '', amount: amount ?? '' } }),
          },
        ],
      );
    } else if (data.startsWith('mtbk://pay')) {
      const url = new URL(data.replace('mtbk://', 'https://mtbk/'));
      const merchant = url.searchParams.get('merchant');
      const amount = url.searchParams.get('amount');
      Alert.alert(
        'Оплата',
        `Мерчант: ${merchant}${amount ? `\nСумма: ${amount} ₽` : ''}`,
        [
          { text: 'Отмена', onPress: () => setScanned(false), style: 'cancel' },
          {
            text: 'Оплатить',
            onPress: () => router.replace({ pathname: '/payment', params: { merchant: merchant ?? '', amount: amount ?? '' } }),
          },
        ],
      );
    } else {
      // Обычный QR / ссылка
      Alert.alert(
        'Сканировано',
        data.length > 80 ? data.slice(0, 80) + '...' : data,
        [{ text: 'Ок', onPress: () => setScanned(false) }],
      );
    }
  };

  const renderScanTab = () => {
    if (!permission) {
      return <View style={s.permWrap}><Text style={s.permText}>Загрузка...</Text></View>;
    }

    if (!permission.granted) {
      return (
        <View style={s.permWrap}>
          <MaterialIcons name="camera-alt" size={64} color={colors.onSurfaceVariant} />
          <Text style={s.permTitle}>Нужен доступ к камере</Text>
          <Text style={s.permText}>Для сканирования QR-кодов разрешите доступ к камере</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Разрешить доступ</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <Animated.View entering={FadeIn.duration(300)} style={s.scanWrap}>
        {/* Реальная камера */}
        <View style={s.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          {/* Рамка поверх камеры */}
          <View style={s.overlay}>
            <View style={s.overlayTop} />
            <View style={s.overlayMiddle}>
              <View style={s.overlaySide} />
              <View style={s.frame}>
                <View style={[s.corner, { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 12 }]} />
                <View style={[s.corner, { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 12 }]} />
                <View style={[s.corner, { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 12 }]} />
                <View style={[s.corner, { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 12 }]} />
                <Animated.View style={[s.scanLine, scanLineStyle]} />
              </View>
              <View style={s.overlaySide} />
            </View>
            <View style={s.overlayBottom} />
          </View>
        </View>

        <Text style={s.hint}>Наведите камеру на QR-код{`\n`}для оплаты или перевода</Text>

        <View style={s.acts}>
          <TouchableOpacity style={s.actBtn} onPress={() => setTorch(v => !v)}>
            <View style={[s.actIco, torch && { backgroundColor: colors.primary }]}>
              <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={24} color={torch ? colors.onPrimary : colors.onSurfaceVariant} />
            </View>
            <Text style={s.actLbl}>Фонарик</Text>
          </TouchableOpacity>
          {scanned && (
            <TouchableOpacity style={s.actBtn} onPress={() => setScanned(false)}>
              <View style={s.actIco}>
                <MaterialIcons name="refresh" size={24} color={colors.primary} />
              </View>
              <Text style={[s.actLbl, { color: colors.primary }]}>Снова</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.actBtn} onPress={() => router.push('/history')}>
            <View style={s.actIco}><MaterialIcons name="history" size={24} color={colors.onSurfaceVariant} /></View>
            <Text style={s.actLbl}>История</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.hdr}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={s.hdrt}>QR-код</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.tabs}>
        {(['scan', 'myqr'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && s.tabA]}
            onPress={() => { setTab(t); setScanned(false); }}
          >
            <MaterialIcons
              name={t === 'scan' ? 'qr-code-scanner' : 'qr-code-2'}
              size={18}
              color={tab === t ? colors.onPrimary : colors.onSurfaceVariant}
            />
            <Text style={[s.tabT, tab === t && s.tabTA]}>
              {t === 'scan' ? 'Сканировать' : 'Мой QR'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'scan' ? renderScanTab() : (
        <Animated.View entering={FadeIn.duration(300)} style={s.myWrap}>
          <View style={s.qrCard}>
            <View style={s.qrUser}>
              <View style={s.avatar}>
                <Text style={s.avatarT}>
                  {user?.name?.split(' ').map((n: string) => n[0]).join('') || 'МБ'}
                </Text>
              </View>
              <View>
                <Text style={s.userName}>{user?.name || 'Пользователь'}</Text>
                <Text style={s.userAcc}>Счёт: •••• {acc?.id?.slice(-4) || '0000'}</Text>
              </View>
            </View>
            <View style={s.qrBox}>
              <MaterialIcons name="qr-code-2" size={180} color="#1a1a1a" />
            </View>
            <Text style={s.qrDesc}>Покажите QR-код отправителю для получения перевода</Text>
          </View>
          <View style={s.myActs}>
            {[
              { i: 'content-copy', t: 'Копировать' },
              { i: 'share', t: 'Поделиться' },
              { i: 'save-alt', t: 'Сохранить' },
            ].map((a, idx) => (
              <TouchableOpacity key={idx} style={s.myActBtn} onPress={() => Alert.alert('Готово', a.t)}>
                <MaterialIcons name={a.i as any} size={20} color={colors.primary} />
                <Text style={s.myActT}>{a.t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const mk = (C: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  hdr: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: C.transparentBorder,
  },
  back: { padding: 8 },
  hdrt: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Bold', color: C.onSurface },
  tabs: {
    flexDirection: 'row', marginHorizontal: Spacing.xl, marginTop: Spacing.base,
    backgroundColor: C.surfaceContainerHigh, borderRadius: BorderRadius.base, padding: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: BorderRadius.md, gap: 6,
  },
  tabA: { backgroundColor: C.primary, ...Shadows.primary },
  tabT: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Bold', color: C.onSurfaceVariant },
  tabTA: { color: C.onPrimary },

  // Scan tab
  scanWrap: { flex: 1, alignItems: 'center', paddingBottom: 32 },
  cameraContainer: {
    width: SCAN_SIZE, height: SCAN_SIZE, marginTop: Spacing.xl,
    borderRadius: BorderRadius.lg, overflow: 'hidden',
  },
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayMiddle: { flexDirection: 'row', height: SCAN_SIZE },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  frame: { width: SCAN_SIZE, height: SCAN_SIZE, overflow: 'hidden' },
  corner: {
    position: 'absolute', width: 32, height: 32,
    borderColor: C.primary, borderWidth: 3,
  },
  scanLine: {
    position: 'absolute', left: 8, right: 8, height: 2,
    backgroundColor: C.primary, borderRadius: 1, opacity: 0.9,
  },
  hint: {
    fontSize: Fonts.sizes.md, color: C.onSurfaceVariant, textAlign: 'center',
    marginTop: Spacing.xl, fontFamily: 'Manrope-Medium', lineHeight: 22,
  },
  acts: { flexDirection: 'row', justifyContent: 'center', gap: Spacing['2xl'], marginTop: Spacing.xl },
  actBtn: { alignItems: 'center', gap: Spacing.sm },
  actIco: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center',
  },
  actLbl: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant },

  // Permission
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.base },
  permTitle: { fontSize: Fonts.sizes.lg, fontFamily: 'Manrope-Bold', color: C.onSurface, textAlign: 'center' },
  permText: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, textAlign: 'center' },
  permBtn: {
    backgroundColor: C.primary, borderRadius: BorderRadius.base,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.base, marginTop: Spacing.base,
  },
  permBtnText: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onPrimary },

  // My QR
  myWrap: { flex: 1, padding: Spacing.xl, justifyContent: 'center' },
  qrCard: {
    backgroundColor: C.surfaceContainerLowest, borderRadius: BorderRadius.xl,
    padding: Spacing.xl, alignItems: 'center',
    borderWidth: 1, borderColor: C.transparentBorder, ...Shadows.md,
  },
  qrUser: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.base,
    marginBottom: Spacing.xl, alignSelf: 'flex-start',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
  avatarT: { fontSize: Fonts.sizes.md, fontFamily: 'Manrope-ExtraBold', color: C.onPrimary },
  userName: { fontSize: Fonts.sizes.base, fontFamily: 'Manrope-Bold', color: C.onSurface },
  userAcc: { fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant, marginTop: 2 },
  qrBox: { padding: Spacing.xl, backgroundColor: '#ffffff', borderRadius: BorderRadius.lg, marginVertical: Spacing.base },
  qrDesc: {
    fontSize: Fonts.sizes.sm, fontFamily: 'Manrope-Medium', color: C.onSurfaceVariant,
    textAlign: 'center', marginTop: Spacing.base, lineHeight: 18,
  },
  myActs: { flexDirection: 'row', justifyContent: 'space-around', marginTop: Spacing.xl },
  myActBtn: { alignItems: 'center', gap: 6, padding: Spacing.sm },
  myActT: { fontSize: Fonts.sizes.xs, fontFamily: 'Manrope-Bold', color: C.primary },
});
