import assert from 'node:assert/strict';

/** Fail at the fixture boundary with evidence instead of suppressing nullability. */
export function required<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, 'required fixture value is present');
  return value;
}
