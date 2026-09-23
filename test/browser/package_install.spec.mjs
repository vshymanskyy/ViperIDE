import { expect, test } from "./fixtures.mjs";

test("test_install_package_link_uses_dialog", async ({ page, consoleErrors }, testInfo) => {
  await page.goto("/?vm=1", { waitUntil: "domcontentloaded" });

  await page.locator('[data-target="menu-tools"]').click();
  await page.locator("#install-via-url").click();

  const dialog = page.locator("#user-input-dialog");
  const packageInput = page.locator("#user-input-value");
  await expect(dialog).toBeVisible();
  await expect(packageInput).toBeFocused();
  await packageInput.fill("micropython-test-package");

  const screenshotPath = testInfo.outputPath("install-package-dialog.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("install-package-dialog.png", {
    path: screenshotPath,
    contentType: "image/png",
  });

  await dialog.getByRole("button", { name: "Cancel" }).click();

  await expect(dialog).not.toBeVisible();
  expect(consoleErrors).toEqual([]);
});