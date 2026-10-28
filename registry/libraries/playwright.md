---
id: playwright
name: Playwright
category: library
version: 1.0.0
order: 40
description: Role locators, web-first assertions, and isolated browser tests.
scope: glob
globs:
  - "e2e/**/*.ts"
  - "**/e2e/**/*.ts"
  - "**/*.e2e.ts"
detect:
  packages: ["@playwright/test"]
appliesTo:
  "@playwright/test": ">=1.40"
sources:
  - https://playwright.dev/docs/locators
  - https://playwright.dev/docs/best-practices
  - https://playwright.dev/docs/test-assertions
  - https://playwright.dev/docs/pom
  - https://playwright.dev/docs/api/class-frame
verifiedAt: 2026-10-28
---

## Boundary
A locator re-queries the DOM and waits until the target is actionable. `getByRole` matches the element's role and accessible name. A web-first assertion retries until the condition holds or the expect timeout ends. The default expect timeout is 5 seconds. Each test gets its own `page`, storage, and cookies. `page.waitForTimeout` is for debugging. A test that waits a fixed time is flaky.

## Directives
- **ALWAYS** locate an element with `getByRole` and its accessible name, or with `getByLabel` for a form control. **NEVER** locate by a CSS class or an XPath.
- **ALWAYS** `await` a web-first matcher such as `expect(locator).toBeVisible()` or `expect(locator).toHaveText()`. **NEVER** write `expect(await locator.isVisible()).toBe(true)`.
- **NEVER** call `page.waitForTimeout` or `frame.waitForTimeout` in a test.
- **ALWAYS** create the records a test needs in that test or in `beforeEach`. **NEVER** let one test read or write records that belong to another test.
- **PREFER** a page object when the same locators or steps appear in more than one test. A locator used once stays in the test.
- **ALWAYS** run the suite with `{{scripts.test}}`.

## Contract
```ts
import { expect, test } from "@playwright/test";

test("shows the saved name", async ({ page }) => {
  await page.goto("/profile");
  await page.getByLabel("Name").fill("Ada");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Ada");
});

// ❌ Anti-pattern: a class selector, a fixed wait, and a check that does not retry
await page.locator("button.save").click();
await page.waitForTimeout(1000);
expect(await page.locator(".status").isVisible()).toBe(true);
```
