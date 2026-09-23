import { expect, test } from "./fixtures.mjs";
import {
  configureTypechecking,
  createPythonFile,
  expectVmTypecheckingReady,
  pyrightRows,
  setEditorContent,
} from "./helpers.mjs";

const failureScenarios = [
  {
    failureName: "manifest",
    requestPattern: /\/pyright-worker\/assets\/stubs-manifest\.json$/,
    responseStatus: 503,
  },
];

for (const { failureName, requestPattern, responseStatus } of failureScenarios) {
  // Ensures startup asset failures are visible and type checking can recover after the asset becomes available.
  test(
    "test_typechecking_startup_failure_is_visible_and_retryable",
    async ({ page, context, consoleErrors }, testInfo) => {
      await configureTypechecking(page);
      const blockedRequests = [];
      const failRequest = async (route) => {
        blockedRequests.push(route.request().url());
        if (responseStatus === null) {
          await route.abort("failed");
        } else {
          await route.fulfill({
            status: responseStatus,
            contentType: "text/plain",
            body: "temporary type-checking asset failure",
          });
        }
      };

      await context.route(requestPattern, failRequest);
      await page.goto("/?vm=1", { waitUntil: "domcontentloaded" });

      const status = page.locator("#typecheck-tab");
      const enabled = page.locator("#typecheck-enabled");
      await expect(status).toHaveAttribute("data-state", "error", { timeout: 45_000 });
      await expect(status).toHaveAttribute(
        "title",
        /Pyright failed: .+Disable and enable type checking in Settings to retry\./i,
      );
      await expect(enabled).toBeEnabled();
      await expect(page.locator(".cm-content")).toBeVisible({ timeout: 30_000 });
      expect(blockedRequests.length).toBeGreaterThan(0);

      const errorScreenshotPath = testInfo.outputPath(`typechecking-startup-${failureName}-error.png`);
      await page.screenshot({ path: errorScreenshotPath });
      await testInfo.attach(`typechecking-startup-${failureName}-error.png`, {
        path: errorScreenshotPath,
        contentType: "image/png",
      });

      await context.unroute(requestPattern, failRequest);
      await page.locator('[data-target="menu-settings"]').click();
      await enabled.uncheck();
      await expect(status).toHaveAttribute("data-state", "disabled");
      await enabled.check();

      await expectVmTypecheckingReady(page);
      await expect(page.locator(".cm-content")).toBeVisible();

      const recoveredScreenshotPath = testInfo.outputPath(
        `typechecking-startup-${failureName}-recovered.png`,
      );
      await page.screenshot({ path: recoveredScreenshotPath });
      await testInfo.attach(`typechecking-startup-${failureName}-recovered.png`, {
        path: recoveredScreenshotPath,
        contentType: "image/png",
      });
      await testInfo.attach("captured-console-errors.json", {
        body: JSON.stringify(consoleErrors),
        contentType: "application/json",
      });
    },
  );
}

// Verifies edits in one open module immediately reanalyze dependent imports in another tab.
test("test_local_imports_follow_changes_across_open_tabs", async ({ page, consoleErrors }, testInfo) => {
  await configureTypechecking(page, { "typecheck-scope": "openFilesOnly" });
  await page.goto("/?vm=1", { waitUntil: "domcontentloaded" });

  const status = await expectVmTypecheckingReady(page);

  await createPythonFile(page, "helper.py", "def make_label(value: int) -> str:\n    return str(value)\n");
  await createPythonFile(
    page,
    "consumer.py",
    "from helper import make_label\n\nlabel: int = make_label(1)\n",
  );

  await page.locator('[data-target="diagnostics"]').click();
  const consumerRows = pyrightRows(page, "/consumer.py");
  await expect(consumerRows).toHaveCount(1, { timeout: 30_000 });
  await expect(consumerRows.first()).toContainText("not assignable");
  await expect(consumerRows.first()).not.toContainText("could not be resolved");

  await page.locator('#editor-tabs .tab[data-fn="/helper.py"]').click();
  await page
    .locator(".editor-tab-pane.active .cm-content")
    .fill("def make_label(value: int) -> int:\n    return value\n");

  await expect(consumerRows).toHaveCount(0, { timeout: 30_000 });
  await page.locator('#editor-tabs .tab[data-fn="/consumer.py"]').click();
  await expect(page.locator(".editor-tab-pane.active .cm-content")).toContainText(
    "from helper import make_label",
  );
  await expect(status).toHaveAttribute("data-state", "ready");
  expect(consoleErrors).toEqual([]);

  const screenshotPath = testInfo.outputPath("typechecking-local-multi-tab-imports.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("typechecking-local-multi-tab-imports.png", {
    path: screenshotPath,
    contentType: "image/png",
  });
});

// Guards completion triggering so the first dot opens suggestions reliably after repeated editor resets.
test("test_dotted_completion_opens_on_every_first_trigger", async ({ page, consoleErrors }, testInfo) => {
  await configureTypechecking(page, {
    "typecheck-scope": "openFilesOnly",
    "typecheck-stub-port": "webassembly",
  });
  await page.goto("/?vm=1", { waitUntil: "domcontentloaded" });

  await expectVmTypecheckingReady(page, "webassembly");
  const editor = page.locator(".editor-tab-pane.active .cm-content");
  const autocomplete = page.locator(".cm-tooltip-autocomplete");

  for (let iteration = 0; iteration < 5; iteration += 1) {
    await setEditorContent(editor, "import time as t\n");
    await editor.pressSequentially("t.", { delay: 30 });
    await expect(autocomplete).toBeVisible({ timeout: 15_000 });
    await expect(autocomplete.locator(".cm-completionLabel", { hasText: "sleep" }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(autocomplete).toBeHidden();
  }

  await setEditorContent(editor, "import time as t\n");
  await editor.pressSequentially("t.", { delay: 30 });
  await expect(autocomplete).toBeVisible({ timeout: 15_000 });
  await expect(autocomplete.locator(".cm-completionLabel", { hasText: "sleep" }).first()).toBeVisible();
  expect(consoleErrors).toEqual([]);

  const screenshotPath = testInfo.outputPath("typechecking-dotted-autocomplete.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("typechecking-dotted-autocomplete.png", {
    path: screenshotPath,
    contentType: "image/png",
  });
});

// Ensures rapid tab changes cannot associate editor content or diagnostics with the wrong file.
test(
  "test_fast_tab_switching_keeps_content_and_diagnostics_with_their_files",
  async ({ page, consoleErrors }, testInfo) => {
    await configureTypechecking(page, { "typecheck-scope": "openFilesOnly" });
    await page.goto("/?vm=1", { waitUntil: "domcontentloaded" });

    const status = await expectVmTypecheckingReady(page);
    await createPythonFile(page, "switch_a.py", 'only_a: int = "wrong"\n');
    await createPythonFile(page, "switch_b.py", "only_b: str = 42\n");

    await page.locator('[data-target="diagnostics"]').click();
    const firstRows = pyrightRows(page, "/switch_a.py");
    const secondRows = pyrightRows(page, "/switch_b.py");
    await expect(firstRows).toHaveCount(1, { timeout: 30_000 });
    await expect(secondRows).toHaveCount(1, { timeout: 30_000 });

    await page.evaluate(() => {
      for (let index = 0; index < 25; index += 1) {
        document.querySelector('#editor-tabs .tab[data-fn="/switch_a.py"]').click();
        document.querySelector('#editor-tabs .tab[data-fn="/switch_b.py"]').click();
      }
      document.querySelector('#editor-tabs .tab[data-fn="/switch_a.py"]').click();
    });
    await expect(page.locator("#editor-tabs .tab.active")).toHaveAttribute("data-fn", "/switch_a.py");
    const activeEditor = page.locator(".editor-tab-pane.active .cm-content");
    await expect(activeEditor).toContainText('only_a: int = "wrong"');
    await activeEditor.fill("only_a: int = 1\n");

    await expect(firstRows).toHaveCount(0, { timeout: 30_000 });
    await expect(secondRows).toHaveCount(1);
    await page.locator('#editor-tabs .tab[data-fn="/switch_b.py"]').click();
    await expect(page.locator(".editor-tab-pane.active .cm-content")).toContainText("only_b: str = 42");
    await expect(status).toHaveAttribute("data-state", "ready");
    expect(consoleErrors).toEqual([]);

    const screenshotPath = testInfo.outputPath("typechecking-fast-tab-switching.png");
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach("typechecking-fast-tab-switching.png", {
      path: screenshotPath,
      contentType: "image/png",
    });
  },
);

// Verifies changing stub ports reanalyzes open files without losing their unsaved content.
test("test_stub_port_changes_reanalyze_open_files", async ({ page, consoleErrors }, testInfo) => {
  await configureTypechecking(page, { "typecheck-scope": "openFilesOnly" });
  await page.goto("/?vm=1", { waitUntil: "domcontentloaded" });

  const status = await expectVmTypecheckingReady(page);
  const editor = page.locator(".editor-tab-pane.active .cm-content");

  await editor.fill("import rp2\n");
  await page.locator('[data-target="diagnostics"]').click();
  const missingRp2 = pyrightRows(page, "/main.py").filter({
    hasText: 'Import "rp2" could not be resolved',
  });
  await expect(missingRp2).toHaveCount(1, { timeout: 30_000 });

  await page.locator('[data-target="menu-settings"]').click();
  const port = page.locator("#typecheck-stub-port");
  await expect(port).toHaveValue("esp32");
  await port.selectOption("rp2");
  await expect(status).toHaveAttribute("title", /standard mode with rp2 stubs/, { timeout: 90_000 });
  await expect(missingRp2).toHaveCount(0, { timeout: 30_000 });
  await expect(editor).toContainText("import rp2");

  const screenshotPath = testInfo.outputPath("typechecking-rp2-stubs-resolve-import.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("typechecking-rp2-stubs-resolve-import.png", {
    path: screenshotPath,
    contentType: "image/png",
  });

  await port.selectOption("esp32");
  await expect(status).toHaveAttribute("title", /standard mode with esp32 stubs/, {
    timeout: 90_000,
  });
  await expect(missingRp2).toHaveCount(1, { timeout: 30_000 });
  await expect(editor).toContainText("import rp2");
  expect(consoleErrors).toEqual([]);
});

// Verifies the client-owned Viper tools overlay can be toggled without replacing board stubs.
test("test_viper_tools_stubs_toggle_import_resolution", async ({ page, consoleErrors }) => {
  await configureTypechecking(page, {
    "advanced-mode": true,
    "typecheck-scope": "openFilesOnly",
  });
  await page.goto("/?vm=1", { waitUntil: "domcontentloaded" });

  const status = await expectVmTypecheckingReady(page);
  const editor = page.locator(".editor-tab-pane.active .cm-content");
  const missingBleNus = pyrightRows(page, "/main.py").filter({
    hasText: 'Import "ble_nus" could not be resolved',
  });

  await editor.fill("import ble_nus\n");
  await page.locator('[data-target="diagnostics"]').click();
  await expect(missingBleNus).toHaveCount(0, { timeout: 30_000 });

  await page.locator('[data-target="menu-settings"]').click();
  const viperToolsStubs = page.locator("#typecheck-viper-tools-stubs");
  await viperToolsStubs.uncheck();
  await expect(missingBleNus).toHaveCount(1, { timeout: 90_000 });
  await expect(status).toHaveAttribute("title", /standard mode with esp32 stubs/);

  await viperToolsStubs.check();
  await expect(missingBleNus).toHaveCount(0, { timeout: 90_000 });

  expect(consoleErrors).toEqual([]);
});