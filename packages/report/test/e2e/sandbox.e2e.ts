import { brotliCompressSync } from "node:zlib";
import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { renderStandaloneReport, validateCompressedReportForEphemeral } from "../../dist/index.js";

import type { EphemeralPagesContract } from "../../dist/index.js";

const contract = JSON.parse(
  readFileSync(new URL("../../../../compatibility/ephemeral-pages.json", import.meta.url), "utf8"),
) as EphemeralPagesContract;

async function loadedReportFrame(page: any) {
  await expect
    .poll(() =>
      page
        .frames()
        .find((candidate) => candidate.url().endsWith(".html"))
        ?.url(),
    )
    .toMatch(/\/(?:report|hostile)\.html$/);
  const frame = page
    .frames()
    .find((candidate) => /\/(?:report|hostile)\.html$/.test(candidate.url()));
  if (!frame) throw new Error("Synthetic report iframe did not load.");
  return frame;
}

test("[AC-REPORT-005] preserves a selectable export when sandboxed, offline, and denied clipboard access", async ({
  page,
}) => {
  const requests: string[] = [];
  let downloads = 0;
  let popups = 0;
  let navigations = 0;
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  page.on("download", () => (downloads += 1));
  page.on("popup", () => (popups += 1));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && frame.url() !== "about:blank") navigations += 1;
  });

  const reportResponse = page.waitForResponse((response) =>
    response.url().endsWith("/report.html"),
  );
  await page.goto("/");
  const response = await reportResponse;
  const frame = await loadedReportFrame(page);

  await expect(page.locator("#ephemeral-viewer")).toHaveAttribute("sandbox", "allow-scripts");
  expect(response.headers()["content-security-policy"]).toBe(contract.delivery.httpCsp);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-robots-tag"]).toBe("noindex");
  expect(await response.text()).toMatch(/^<!doctype html>\n<html\b[\s\S]*<head>/i);
  await expect(
    frame.locator(
      "form, base, object, embed, iframe, link[href], img[src], audio[src], video[src]",
    ),
  ).toHaveCount(0);

  expect(
    await frame.evaluate(() => {
      try {
        localStorage.setItem("cptv", "must-not-persist");
        return "available";
      } catch (error) {
        return error instanceof DOMException ? error.name : "blocked";
      }
    }),
  ).toBe("SecurityError");

  const requestsBeforeProbe = [...requests];
  expect(
    await frame.evaluate(async () => {
      try {
        await fetch("/probe");
        return "resolved";
      } catch {
        return "rejected";
      }
    }),
  ).toBe("rejected");
  expect(requests).toEqual(requestsBeforeProbe);

  await frame.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked", "NotAllowedError")) },
    });
  });
  await page.context().setOffline(true);
  await frame.getByRole("button", { name: "Copy decision JSON" }).click();
  await frame.getByRole("button", { name: "Copy patch" }).click();

  await expect(frame.locator("#cptv-decision-json")).toHaveJSProperty("selectionStart", 0);
  await expect(frame.locator("#cptv-decision-json")).toHaveJSProperty(
    "selectionEnd",
    await frame
      .locator("#cptv-decision-json")
      .inputValue()
      .then((value) => value.length),
  );
  await expect(frame.locator("#cptv-patch")).toHaveJSProperty("selectionStart", 0);
  await expect(frame.locator("#cptv-patch")).toHaveJSProperty(
    "selectionEnd",
    await frame
      .locator("#cptv-patch")
      .inputValue()
      .then((value) => value.length),
  );
  expect(requests).toEqual(["/", "/report.html"]);
  expect(downloads).toBe(0);
  expect(popups).toBe(0);
  expect(navigations).toBe(1);
});

test("[AC-REPORT-005] keeps hostile synthetic content inert in the service sandbox", async ({
  page,
}) => {
  await page.goto("/?hostile=1");
  const frame = await loadedReportFrame(page);

  expect(
    await frame.evaluate(() => (window as Window & { pwned?: boolean }).pwned),
  ).toBeUndefined();
  await expect(frame.locator("img, form")).toHaveCount(0);
  await expect(frame.locator(".candidate")).toContainText(
    "</script><script>window.pwned = true</script><textarea>",
  );
  await expect(frame.locator("#cptv-patch")).toHaveValue("");
});

test("[AC-REPORT-007][AC-REPORT-008][AC-REPORT-009] regenerates a conservative review decision and patch in the sandbox", async ({
  page,
}) => {
  await page.goto("/");
  const frame = await loadedReportFrame(page);
  const candidate = frame.locator("[data-cptv-candidate]");
  const decisionOutput = frame.locator("#cptv-decision-json");
  const patchOutput = frame.locator("#cptv-patch");

  await candidate.getByRole("button", { name: "Accept" }).click();
  await expect(candidate.locator("[data-cptv-status]")).toContainText("Review required");
  expect(JSON.parse(await decisionOutput.inputValue())).toMatchObject({
    candidates: [
      {
        id: "synthetic-tone",
        missing: ["syntax", "inherits", "initial-value"],
        status: "review-required",
      },
    ],
  });
  await expect(patchOutput).toHaveValue("");

  await candidate.locator("[data-cptv-syntax]").selectOption("0");
  await candidate.getByRole("button", { name: "False" }).click();
  await candidate.locator("[data-cptv-initial-value]").fill("teal");
  await expect(candidate.locator("[data-cptv-status]")).toContainText(
    "Ready for reviewable patch generation",
  );
  const readyDecision = JSON.parse(await decisionOutput.inputValue());
  expect(readyDecision).toMatchObject({
    candidates: [
      {
        decision: "accept",
        id: "synthetic-tone",
        inherits: false,
        initialValue: "teal",
        missing: [],
        status: "ready",
        syntax: { alternativeId: "color", source: "alternative", value: "<color>" },
      },
    ],
    schemaVersion: "cptv-registration-review/v1",
  });
  await expect(patchOutput).toHaveValue(
    "@property --synthetic-tone { syntax: '<color>'; inherits: false; initial-value: teal; }",
  );

  await candidate.locator("[data-cptv-syntax]").selectOption("custom");
  await candidate.locator("[data-cptv-custom-syntax]").fill("<length>");
  expect(JSON.parse(await decisionOutput.inputValue())).toMatchObject({
    candidates: [{ syntax: { alternativeId: null, source: "custom", value: "<length>" } }],
  });

  await candidate.locator("[data-cptv-syntax]").selectOption("1");
  await expect(candidate.locator("[data-cptv-initial-value]")).toBeDisabled();
  expect(JSON.parse(await decisionOutput.inputValue())).toMatchObject({
    candidates: [{ initialValue: null, missing: [], status: "ready", syntax: { value: "*" } }],
  });
  await expect(patchOutput).toHaveValue(
    "@property --synthetic-tone { syntax: '*'; inherits: false;  }",
  );
});

test("[AC-REPORT-006] checks synthetic report bytes against both pinned upload limits", async () => {
  const report = renderStandaloneReport(
    { analysis: { synthetic: true }, decisionJson: { reviewed: true }, patch: "" },
    contract,
  );
  const compressedBytes = brotliCompressSync(Buffer.from(report.html, "utf8")).byteLength;
  const validation = validateCompressedReportForEphemeral(report.html, compressedBytes, contract);

  expect(validation).toMatchObject({
    ok: true,
    rawBytes: report.rawBytes,
    rawLimitBytes: contract.delivery.uploadLimits.rawHtmlBytes,
    brotliCompressedBytes: compressedBytes,
    brotliCompressedLimitBytes: contract.delivery.uploadLimits.brotliCompressedHtmlBytes,
  });
});
