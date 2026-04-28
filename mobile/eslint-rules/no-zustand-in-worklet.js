'use strict';

/**
 * ANIM-03 + D-07/D-08/D-09 — block Zustand reads inside Reanimated worklets.
 *
 * Worklets execute on the UI thread; reading Zustand from a worklet either
 * crashes (the store is JS-thread state) or silently breaks (closures over
 * stale snapshots). Pass values via SharedValues or props; read the store
 * on the JS thread and mirror via useDerivedValue.
 *
 * Detection covers:
 *   - 'worklet' directive prologue inside a function body (Pitfall 5: also
 *     catches const-assigned arrow passed to useAnimatedStyle by name).
 *   - Function literal passed as an argument to a known worklet API
 *     (useAnimatedStyle / useDerivedValue / useAnimatedReaction /
 *     useAnimatedScrollHandler / useAnimatedGestureHandler / runOnUI /
 *     withSpring / withTiming).
 *   - Identifier names imported from any `stores/` module (D-09 — selector
 *     helpers re-exported from stores/ defeat a pure name-based check).
 */

const STORES_PATH_RE = /^(\.\.\/)+stores\//;
const ABS_STORES_PATH_RE = /^mobile\/stores\//;

const WORKLET_CALLEES = new Set([
  'useAnimatedStyle',
  'useDerivedValue',
  'useAnimatedReaction',
  'useAnimatedScrollHandler',
  'useAnimatedGestureHandler',
  'runOnUI',
  'withSpring',
  'withTiming',
]);

function hasWorkletDirective(node) {
  const body = node.body;
  if (!body || body.type !== 'BlockStatement' || !Array.isArray(body.body) || body.body.length === 0) {
    return false;
  }
  const first = body.body[0];
  return (
    first.type === 'ExpressionStatement' &&
    first.directive === 'worklet'
  );
}

function isWorkletCalleeArg(node) {
  const parent = node.parent;
  if (!parent || parent.type !== 'CallExpression') return false;
  if (!parent.arguments.includes(node)) return false;
  const callee = parent.callee;
  if (callee.type !== 'Identifier') return false;
  return WORKLET_CALLEES.has(callee.name);
}

function isWorkletFn(node) {
  return hasWorkletDirective(node) || isWorkletCalleeArg(node);
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Zustand store reads inside worklet functions',
      url: 'CLAUDE.md#worklets-cannot-reference-zustand',
    },
    schema: [],
    messages: {
      zustandInWorklet:
        "Worklet body references '{{name}}' from Zustand store. Worklets must read from SharedValues only — pass via shared value or prop (CLAUDE.md, Phase-5 D-09).",
    },
  },

  create(context) {
    // Per-file Set of Zustand-imported identifier names.
    const zustandNames = new Set(['useStore', 'useShallow']);
    const sourceCode = context.getSourceCode ? context.getSourceCode() : context.sourceCode;
    const rootAst = sourceCode && sourceCode.ast;

    function walkAndReport(node, isRoot) {
      // Bail on nested non-worklet function bodies (closures over JS thread are fine).
      if (
        !isRoot &&
        (node.type === 'FunctionExpression' ||
          node.type === 'ArrowFunctionExpression' ||
          node.type === 'FunctionDeclaration') &&
        !isWorkletFn(node) &&
        !hasWorkletDirective(node)
      ) {
        return;
      }
      if (node.type === 'Identifier' && zustandNames.has(node.name)) {
        const parent = node.parent;
        if (parent && parent.type === 'ImportSpecifier') return;
        context.report({ node, messageId: 'zustandInWorklet', data: { name: node.name } });
      }
      for (const key in node) {
        if (key === 'parent') continue;
        const child = node[key];
        if (Array.isArray(child)) {
          for (const c of child) {
            if (c && typeof c === 'object' && typeof c.type === 'string') walkAndReport(c, false);
          }
        } else if (child && typeof child === 'object' && typeof child.type === 'string') {
          walkAndReport(child, false);
        }
      }
    }

    return {
      ImportDeclaration(node) {
        const src = node.source && node.source.value;
        if (typeof src !== 'string') return;
        if (STORES_PATH_RE.test(src) || ABS_STORES_PATH_RE.test(src)) {
          for (const spec of node.specifiers) {
            if (spec.local && spec.local.name) zustandNames.add(spec.local.name);
          }
        }
      },
      'FunctionExpression, ArrowFunctionExpression'(node) {
        if (!isWorkletFn(node)) return;
        walkAndReport(node, true);
      },
    };
  },
};
