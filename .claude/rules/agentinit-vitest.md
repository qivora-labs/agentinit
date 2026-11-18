---
paths:
  - "**/*.test.tsx"
  - "**/*.test.jsx"
  - "**/*.spec.tsx"
  - "**/*.spec.jsx"
  - "*.test.ts"
  - "*.test.js"
  - "*.spec.ts"
  - "*.spec.js"
  - "src/**/*.test.ts"
  - "src/**/*.test.js"
  - "src/**/*.spec.ts"
  - "src/**/*.spec.js"
  - "app/**/*.test.ts"
  - "app/**/*.test.js"
  - "app/**/*.spec.ts"
  - "app/**/*.spec.js"
  - "lib/**/*.test.ts"
  - "lib/**/*.test.js"
  - "lib/**/*.spec.ts"
  - "lib/**/*.spec.js"
  - "server/**/*.test.ts"
  - "server/**/*.test.js"
  - "server/**/*.spec.ts"
  - "server/**/*.spec.js"
  - "pages/**/*.test.ts"
  - "pages/**/*.test.js"
  - "pages/**/*.spec.ts"
  - "pages/**/*.spec.js"
  - "components/**/*.test.ts"
  - "components/**/*.test.js"
  - "components/**/*.spec.ts"
  - "components/**/*.spec.js"
  - "test/**/*.test.ts"
  - "test/**/*.test.js"
  - "test/**/*.spec.ts"
  - "test/**/*.spec.js"
  - "tests/*.test.ts"
  - "tests/*.test.js"
  - "tests/unit/**/*.test.ts"
  - "tests/unit/**/*.test.js"
  - "tests/integration/**/*.test.ts"
  - "tests/integration/**/*.test.js"
  - "__tests__/**/*.test.ts"
  - "__tests__/**/*.test.js"
  - "__tests__/**/*.spec.ts"
  - "__tests__/**/*.spec.js"
---

## Boundary
`describe` groups the tests for one unit. `it` and `test` are the same function. `vi.mock` is hoisted to the top of the file and runs before imports. `vi.useFakeTimers` replaces `setTimeout`, `setInterval`, and `Date` until `vi.useRealTimers`. `toMatchSnapshot` compares serialized output with a file stored next to the test.

## Directives
- **ALWAYS** group one unit's tests in a `describe` named for that unit. **ALWAYS** name `it` or `test` after a result the caller can observe, such as `returns 0 for an empty cart`. **NEVER** name a test after an internal call.
- **ALWAYS** assert an observable result: the returned value, the thrown error, or a callback the caller passed in. **NEVER** assert the order of calls inside the unit.
- **ALWAYS** call `vi.mock` at the top level of the test file, with `vi` imported from `vitest`, and only for a module the unit does not own. **NEVER** mock the module under test.
- **ALWAYS** call `vi.useFakeTimers()` before code that schedules a timer, then advance with `vi.advanceTimersByTime` or `vi.runAllTimers`. **ALWAYS** call `vi.useRealTimers()` before the file moves on.
- **PREFER** `expect(value).toEqual` when the expected value can be written in the test. Use `toMatchSnapshot` only for a large stable structure. **NEVER** accept a snapshot update without reading the diff.
- **ALWAYS** run the suite with `pnpm test`.

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

// ❌ Anti-pattern: a hoisted mock of the unit, and a name that describes an internal call
// vi.mock("./price-after");
// it("calls loadRate", () => {
//   expect(true).toBe(true);
// });
```
