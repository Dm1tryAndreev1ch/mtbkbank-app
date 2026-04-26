// mobile/__tests__/biometric-guard.test.tsx
//
// D-03 + D-14 — BiometricGuard reads tokenStore.isAuthed() (NOT SecureStore) and
// respects LocalAuthentication availability + result. Existing Reanimated animations
// are not exercised here (animation-system tests come in Phase 5+).
//
// Each biometric-required test asserts that `expo-secure-store.getItemAsync` was
// NEVER called — proves the read source moved from SecureStore to tokenStore.

import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Text } from 'react-native';

// Reanimated mock — canonical mock per react-native-reanimated docs.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Sentry — prevent init side effects in tokenStore module load (defensive; not actually
// imported here, but tokenStore is mocked anyway).
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (c: any) => c,
  captureException: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  mobileReplayIntegration: jest.fn(() => ({ name: 'MobileReplay' })),
}));

// expo-secure-store: present ONLY to assert it is never called by BiometricGuard.
const mockSecureGet = jest.fn(async () => null);
jest.mock('expo-secure-store', () => ({
  getItemAsync: mockSecureGet,
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// tokenStore — synchronous in-memory mirror; toggled per test via mockIsAuthed.
const mockIsAuthed = jest.fn(() => false);
jest.mock('../services/tokenStore', () => ({
  __esModule: true,
  isAuthed: () => mockIsAuthed(),
  isHydrated: () => true,
  hydrate: jest.fn(async () => {}),
  setTokens: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
  getAccess: jest.fn(() => null),
  getRefresh: jest.fn(() => null),
  subscribe: jest.fn(() => () => {}),
  refreshOnce: jest.fn(),
  STORAGE_KEYS: { access: 'auth.access', refresh: 'auth.refresh' },
}));

// expo-local-authentication — toggleable hardware/enrollment/auth result.
const mockHasHardware = jest.fn(async () => true);
const mockIsEnrolled = jest.fn(async () => true);
const mockSupportedTypes = jest.fn(async () => [1]);
const mockAuthenticate = jest.fn(async () => ({ success: true }));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: () => mockHasHardware(),
  isEnrolledAsync: () => mockIsEnrolled(),
  supportedAuthenticationTypesAsync: () => mockSupportedTypes(),
  authenticateAsync: () => mockAuthenticate(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
}));

// Theme hook — stub to a deterministic palette so component renders without provider.
jest.mock('../hooks/useThemeColor', () => ({
  useThemeColor: () => ({
    background: '#000',
    surface: '#111',
    surfaceContainerLowest: '#111',
    surfaceContainerHigh: '#222',
    onSurface: '#fff',
    onSurfaceVariant: '#aaa',
    onPrimary: '#fff',
    primary: '#0aa',
    transparentBorder: 'transparent',
  }),
}));

import BiometricGuard from '../components/BiometricGuard';

beforeEach(() => {
  mockSecureGet.mockClear();
  mockIsAuthed.mockClear();
  mockIsAuthed.mockReturnValue(false);
  mockHasHardware.mockClear();
  mockHasHardware.mockResolvedValue(true);
  mockIsEnrolled.mockClear();
  mockIsEnrolled.mockResolvedValue(true);
  mockSupportedTypes.mockClear();
  mockSupportedTypes.mockResolvedValue([1]);
  mockAuthenticate.mockClear();
  mockAuthenticate.mockResolvedValue({ success: true });
});

describe('BiometricGuard — D-03 tokenStore read source + D-14 happy / no-hardware paths', () => {
  test('isAuthed === false → children render; authenticateAsync NOT called; SecureStore NOT called', async () => {
    mockIsAuthed.mockReturnValue(false);
    const { findByText } = render(
      <BiometricGuard><Text>CHILD-NOAUTH</Text></BiometricGuard>,
    );
    expect(await findByText('CHILD-NOAUTH')).toBeTruthy();
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockIsAuthed).toHaveBeenCalled();
  });

  test('isAuthed === true + no hardware → biometric pass-through (children render); SecureStore NOT called', async () => {
    jest.useFakeTimers();
    mockIsAuthed.mockReturnValue(true);
    mockHasHardware.mockResolvedValue(false);
    mockIsEnrolled.mockResolvedValue(false);

    const { findByText } = render(
      <BiometricGuard><Text>CHILD-NOHW</Text></BiometricGuard>,
    );

    // The component first hides children behind the lock overlay; once authenticate()
    // sees no hardware it sets isUnlocked=true synchronously (no setTimeout path).
    await waitFor(() => expect(mockHasHardware).toHaveBeenCalled());
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(await findByText('CHILD-NOHW')).toBeTruthy();
    expect(mockAuthenticate).not.toHaveBeenCalled();
    expect(mockSecureGet).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('isAuthed === true + hardware available + auth success → children render after unlock; SecureStore NOT called', async () => {
    jest.useFakeTimers();
    mockIsAuthed.mockReturnValue(true);
    mockHasHardware.mockResolvedValue(true);
    mockIsEnrolled.mockResolvedValue(true);
    mockAuthenticate.mockResolvedValue({ success: true });

    const { findByText } = render(
      <BiometricGuard><Text>CHILD-HAPPY</Text></BiometricGuard>,
    );

    await waitFor(() => expect(mockAuthenticate).toHaveBeenCalled());

    // Existing setTimeout(() => setIsUnlocked(true), 250) — flush it.
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(await findByText('CHILD-HAPPY')).toBeTruthy();
    expect(mockSecureGet).not.toHaveBeenCalled();
    expect(mockIsAuthed).toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('tokenStore.isAuthed is the read source (SecureStore.getItemAsync NEVER called across all paths)', async () => {
    // Run all three branches in sequence; the SecureStore mock counter must remain 0.
    mockIsAuthed.mockReturnValue(false);
    render(<BiometricGuard><Text>A</Text></BiometricGuard>);
    mockIsAuthed.mockReturnValue(true);
    mockHasHardware.mockResolvedValueOnce(false);
    mockIsEnrolled.mockResolvedValueOnce(false);
    render(<BiometricGuard><Text>B</Text></BiometricGuard>);
    mockHasHardware.mockResolvedValueOnce(true);
    mockIsEnrolled.mockResolvedValueOnce(true);
    render(<BiometricGuard><Text>C</Text></BiometricGuard>);

    await waitFor(() => expect(mockIsAuthed).toHaveBeenCalled());
    expect(mockSecureGet).not.toHaveBeenCalled();
  });
});
