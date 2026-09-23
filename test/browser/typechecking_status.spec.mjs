import { expect, test } from "./fixtures.mjs";

// Ensures users can stop and restart Pyright without disrupting the editor or leaking worker errors.
test(
  "test_typechecking_status_can_disable_and_restore_pyright",
  async ({ page, consoleErrors }, testInfo) => {
    page.on("dialog", (dialog) => dialog.dismiss());

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const status = page.locator("#typecheck-tab");
    const enabled = page.locator("#typecheck-enabled");
    const editorArea = page.locator("#main-editor");
    const typecheckTab = page.locator('[data-target="diagnostics"]');
    const settingsTab = page.locator('[data-target="menu-settings"]');
    await expect(status).toHaveAttribute("data-state", "ready", { timeout: 90_000 });
    await expect(status).toHaveAttribute("data-state", "ready");
    await expect(editorArea).toBeVisible();

    await typecheckTab.click();
    await expect(page.locator("#typechecking-status")).toHaveCount(0);
    await settingsTab.click();
    await enabled.uncheck();

    await expect(status).toHaveAttribute("data-state", "disabled");
    await expect(enabled).not.toBeChecked();
    for (const id of [
      "typecheck-mode",
      "typecheck-scope",
      "typecheck-autodetect",
      "typecheck-stub-family",
      "typecheck-stub-version",
      "typecheck-stub-port",
      "typecheck-stub-board",
      "typecheck-viper-tools-stubs",
      "typecheck-stub-package",
      "typecheck-stub-install",
      "typecheck-stub-clear",
    ]) {
      await expect(page.locator(`#${id}`)).toBeDisabled();
    }
    await expect(editorArea).toBeVisible();
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem("settings"))["typecheck-enabled"]),
    ).toBe(false);

    await enabled.check();

    await expect(status).toHaveAttribute("data-state", "ready", { timeout: 90_000 });
    await expect(status).toHaveAttribute("data-state", "ready");
    await expect(enabled).toBeChecked();
    await expect(page.locator("#typecheck-mode")).toBeEnabled();
    await expect(page.locator("#typecheck-scope")).toBeEnabled();
    await expect(page.locator("#typecheck-autodetect")).toBeEnabled();
    await expect(page.locator("#typecheck-viper-tools-stubs")).toBeEnabled();
    await expect(page.locator("#typecheck-stub-package")).toBeEnabled();
    await expect(page.locator("#typecheck-stub-install")).toBeEnabled();
    await expect(page.locator("#typecheck-stub-clear")).toBeEnabled();
    await expect(editorArea).toBeVisible();
    expect(consoleErrors).toEqual([]);

    const screenshotPath = testInfo.outputPath("typechecking-status-ready.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("typechecking-status-ready.png", {
      path: screenshotPath,
      contentType: "image/png",
    });
  },
);