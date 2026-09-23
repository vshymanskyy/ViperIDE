import { expect, test as base } from "@playwright/test";

import { collectConsoleErrors } from "./helpers.mjs";

export const test = base.extend({
  // Opt in with test.use({ allowWheelDownloads: true }) for genuine PyPI install coverage.
  allowWheelDownloads: [false, { option: true }],

  // Blocked by default so an unintended wheel download is visible rather than merely slow.
  wheelRequests: [async ({ page, allowWheelDownloads }, use) => {
    const requested = [];
    await page.route(/files\.pythonhosted\.org/, async (route) => {
      requested.push(route.request().url());
      if (allowWheelDownloads) {
        await route.continue();
        return;
      }
      await route.abort("failed");
    });
    await use(requested);
  }, { auto: true }],

  pypiMetadataRequests: [async ({ page, allowWheelDownloads }, use) => {
    const requested = [];
    await page.route(/pypi\.org\/pypi\//, async (route) => {
      requested.push(route.request().url());
      if (allowWheelDownloads) {
        await route.continue();
        return;
      }
      await route.abort("failed");
    });
    await use(requested);
  }, { auto: true }],

  consoleErrors: async ({ page }, use) => {
    const errors = collectConsoleErrors(page);
    await use(errors);
  },
});

export { expect };