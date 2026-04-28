'use strict';

/**
 * ANIM-03 + D-11 RuleTester self-test for mt-bank/no-zustand-in-worklet.
 *
 * Fixtures cover:
 *  - VALID (a): worklet using only shared values
 *  - VALID (b): regular (non-worklet) component calling useStore
 *  - INVALID (a): useAnimatedStyle arrow with 'worklet' + useStore (D-11 a)
 *  - INVALID (b): function with 'worklet' directive imported from ../../stores/useStore (D-11 c)
 *  - INVALID (c): useShallow inside useDerivedValue (D-11 — re-exported helper case)
 *  - INVALID (d): const-assigned arrow with 'worklet' directive passed by name (Pitfall 5)
 */
const { RuleTester } = require('eslint');
const rule = require('../no-zustand-in-worklet');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('no-zustand-in-worklet', rule, {
  valid: [
    {
      name: 'D-11 (b): worklet uses only shared values',
      code:
        "import { useAnimatedStyle } from 'react-native-reanimated';\n" +
        "const s = useAnimatedStyle(() => ({ x: shared.value }));",
    },
    {
      name: 'D-11 (d): regular component calling useStore is fine',
      code:
        "import { useStore } from '../stores/useStore';\n" +
        "function Comp() { return useStore(s => s.x); }",
    },
  ],
  invalid: [
    {
      name: 'D-11 (a): useAnimatedStyle arrow with worklet directive + useStore',
      code:
        "import { useAnimatedStyle } from 'react-native-reanimated';\n" +
        "import { useStore } from '../stores/useStore';\n" +
        "const s = useAnimatedStyle(() => { 'worklet'; return { x: useStore(st => st.x) }; });",
      errors: [{ messageId: 'zustandInWorklet' }],
    },
    {
      name: 'D-11 (c): function with worklet directive imports from ../../stores/useStore',
      code:
        "import { runOnUI } from 'react-native-reanimated';\n" +
        "import { useStore } from '../../stores/useStore';\n" +
        "runOnUI(function update() { 'worklet'; useStore(s => s.x); })();",
      errors: [{ messageId: 'zustandInWorklet' }],
    },
    {
      name: 'useShallow inside useDerivedValue (re-exported helper)',
      code:
        "import { useDerivedValue } from 'react-native-reanimated';\n" +
        "import { useShallow } from '../stores/useStore';\n" +
        "const v = useDerivedValue(() => { 'worklet'; return useShallow(s => s.x); });",
      errors: [{ messageId: 'zustandInWorklet' }],
    },
    {
      name: 'Pitfall 5: const-assigned arrow with worklet directive passed by name',
      code:
        "import { useAnimatedStyle } from 'react-native-reanimated';\n" +
        "import { useStore } from '../stores/useStore';\n" +
        "const update = () => { 'worklet'; const x = useStore(s => s.x); return { x }; };\n" +
        "const s = useAnimatedStyle(update);",
      errors: [{ messageId: 'zustandInWorklet' }],
    },
  ],
});

// RuleTester throws on failure; reaching this line means all fixtures passed.
console.log('OK no-zustand-in-worklet — all fixtures passed');
