// Phase 4 / 04-04 / A-M1 / A-M3 / D-15 — admin onBlur Zod form hook.
//
// Returns { values, errors, setField, blurField, submit, reset }.
// On blur of a single field: runs schema.safeParse and stores Russian error
// for that field only. On submit: runs full safeParse, populates ALL field
// errors on failure, otherwise calls handler with parsed (coerced) data.
import { useState, useCallback } from 'react';

/**
 * Map a Zod issue to a Russian message per UI-SPEC §Admin copy.
 * Falls back to the schema's own `message` (also Russian — backend codebook).
 */
export function mapZodMessage(issue) {
  if (!issue) return '';
  const code = issue.code;
  // Zod 4 uses `origin`; Zod 3 used `type`. Accept both.
  const kind = issue.origin || issue.type;

  // Number coercion failure: z.coerce.number() on 'abc' yields received='NaN'.
  if (code === 'invalid_type' && issue.expected === 'number') {
    if (issue.received === undefined || issue.received === 'undefined') {
      return 'Поле обязательно';
    }
    return 'Введите число';
  }
  // Required / undefined input for non-number types.
  if (code === 'invalid_type' && (issue.received === 'undefined' || issue.received === undefined)) {
    return 'Поле обязательно';
  }
  if (code === 'too_small' && kind === 'number' && Number(issue.minimum) === 0) {
    return 'Значение не может быть отрицательным';
  }
  if (code === 'too_small' && kind === 'number') {
    return `Минимум ${issue.minimum}`;
  }
  if (code === 'too_big' && kind === 'number') {
    return `Максимум ${issue.maximum}`;
  }
  if (code === 'too_small' && kind === 'string') {
    return `Минимум ${issue.minimum} символов`;
  }
  if (code === 'too_big' && kind === 'string') {
    return `Максимум ${issue.maximum} символов`;
  }
  // Fall back to backend Russian message (Phase-3 schemas).
  return issue.message || 'Некорректное значение';
}

export function useZodForm(schema, initialValues = {}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});

  const setField = useCallback((field, value) => {
    setValues((v) => ({ ...v, [field]: value }));
    // Clear the inline error when the user starts editing again.
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }, []);

  const blurField = useCallback(
    (field) => {
      const r = schema.safeParse(values);
      if (r.success) {
        setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
        return;
      }
      const issue = r.error.issues.find((i) => i.path && i.path[0] === field);
      setErrors((e) => ({ ...e, [field]: issue ? mapZodMessage(issue) : undefined }));
    },
    [schema, values]
  );

  const submit = useCallback(
    (handler) =>
      async (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const r = schema.safeParse(values);
        if (!r.success) {
          const next = {};
          for (const issue of r.error.issues) {
            const key = issue.path && issue.path[0];
            if (key && !next[key]) next[key] = mapZodMessage(issue);
          }
          setErrors(next);
          return;
        }
        await handler(r.data);
      },
    [schema, values]
  );

  const reset = useCallback((nextValues = initialValues) => {
    setValues(nextValues);
    setErrors({});
  }, [initialValues]);

  return { values, errors, setField, blurField, submit, reset };
}
