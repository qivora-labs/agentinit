---
id: vitest
name: Vitest
category: library
version: 1.0.0
order: 40
description: Behavior assertions, top-level vi.mock, and fake timers.
scope: glob
globs:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
detect:
  packages: ["vitest"]
appliesTo:
  vitest: ">=3"
sources:
  - https://vitest.dev/guide/learn/writing-tests
  - https://vitest.dev/guide/learn/testing-in-practice
  - https://vitest.dev/api/vi
  - https://vitest.dev/guide/mocking/timers
  - https://vitest.dev/guide/snapshot
  - https://v3.vitest.dev/guide/mocking
verifiedAt: 2026-10-28
---

## Boundary
`describe` groups the tests for one unit. `it` and `test` are the same function. `vi.mock` is hoisted to the top of the file and runs before imports. `vi.useFakeTimers` replaces `setTimeout`, `setInterval`, and `Date` until `vi.useRealTimers`. `toMatchSnapshot` compares serialized output with a file stored next to the test.

## Directives
- **ALWAYS** group one unit's tests in a `describe` named for that unit. **ALWAYS** name `it` or `test` after a result the caller can observe, such as `returns 0 for an empty cart`. **NEVER** name a test after an internal call.
- **ALWAYS** assert the returned value or the thrown error. **NEVER** assert the order of calls inside the unit.
- **ALWAYS** call `vi.mock` at the top level of the test file, with `vi` imported from `vitest`, and only for a module the unit does not own. **NEVER** mock the module under test.
- **ALWAYS** call `vi.useFakeTimers()` before code that schedules a timer, then advance with `vi.advanceTimersByTime` or `vi.runAllTimers`. **ALWAYS** call `vi.useRealTimers()` before the file moves on.
- **PREFER** `expect(value).toEqual` when the expected value can be written in the test. Use `toMatchSnapshot` only for a large stable structure. **NEVER** accept a snapshot update without reading the diff.
- **ALWAYS** run the suite with `{{scripts.test}}`.

## Contract
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { priceAfter } from "./price-after";

vi.mock("./rates", () => ({
  loadRate: () => 2,
}));

function runLater(callback: () => void, ms: number) {
  setTimeout(callback, ms);
}

describe("priceAfter", () => {
  it("returns the price times the rate", () => {
    expect(priceAfter(10)).toBe(20);
  });
});

describe("runLater", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the callback after one second", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    runLater(callback, 1000);
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

// ❌ Anti-pattern: this replaces the unit, and the name describes an internal call
vi.mock("./price-after");
it("calls loadRate", () => {
  expect(true).toBe(true);
});
```
