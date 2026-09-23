import { expect, test } from "./fixtures.mjs";

const webReplPrompt = "Enter WebREPL device address.\nSupported protocols: ws wss rtc";
const createFilePrompt = [
  "Please enter the name.",
  "",
  'Use "/" to create folders along the way:',
  "  folder/myfile.py   - a file in a new folder",
  "  folder/            - just the folder",
].join("\n");

test("test_webrepl_connection_uses_input_dialog", async ({ page, consoleErrors }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#btn-conn-ws").click();
  const dialog = page.locator("#user-input-dialog");
  const input = page.locator("#user-input-value");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#user-input-dialog-title")).toHaveText("Connect WebREPL");
  expect(await page.locator("#user-input-label").textContent()).toBe(webReplPrompt);
  await expect(page.locator("#user-input-confirm")).toHaveText("Connect");
  await expect(input).toHaveValue("ws://192.168.1.123:8266");
  await input.fill("");
  await page.keyboard.press("Enter");

  await expect(dialog).toBeVisible();
  expect(await input.evaluate((element) => element.checkValidity())).toBe(false);
  await page.keyboard.press("Escape");

  await expect(dialog).not.toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("test_create_file_uses_input_dialog", async ({ page, consoleErrors }, testInfo) => {
  await page.goto("/?vm=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#btn-conn-ws")).toHaveClass(/connected/);

  const createFile = page.evaluate(() => globalThis.app.createNewFile("/"));
  const dialog = page.locator("#user-input-dialog");
  const input = page.locator("#user-input-value");
  await expect(page.locator("#user-input-dialog-title")).toHaveText("Creating new file inside /");
  expect(await page.locator("#user-input-label").textContent()).toBe(createFilePrompt);
  await expect(page.locator("#user-input-confirm")).toHaveText("Create");

  const screenshotPath = testInfo.outputPath("create-file-dialog.png");
  await page.screenshot({ path: screenshotPath });
  await testInfo.attach("create-file-dialog.png", {
    path: screenshotPath,
    contentType: "image/png",
  });

  await input.fill("dialog-created.py");
  await page.keyboard.press("Enter");
  await createFile;

  await expect(page.locator('#editor-tabs .tab[data-fn="/dialog-created.py"]')).toBeVisible();

  const invalidCreate = page.evaluate(() => globalThis.app.createNewFile("/"));
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  expect(await input.evaluate((element) => element.checkValidity())).toBe(false);
  await page.keyboard.press("Escape");
  await invalidCreate;

  expect(consoleErrors).toEqual([]);
});

for (const pageName of ["benchmark.html", "bridge.html"]) {
  test(`test_${pageName}_webrepl_uses_input_dialog`, async ({ page, consoleErrors }) => {
    await page.goto(`/${pageName}`, { waitUntil: "domcontentloaded" });

    await page.locator("#btn-conn-ws").click();
    const dialog = page.locator("#user-input-dialog");
    const input = page.locator("#user-input-value");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#user-input-dialog-title")).toHaveText("Connect WebREPL");
    expect(await page.locator("#user-input-label").textContent()).toBe(webReplPrompt);
    await expect(page.locator("#user-input-confirm")).toHaveText("OK");
    await input.fill("");
    await page.keyboard.press("Enter");

    await expect(dialog).toBeVisible();
    expect(await input.evaluate((element) => element.checkValidity())).toBe(false);
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(dialog).not.toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
}
