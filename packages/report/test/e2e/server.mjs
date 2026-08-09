import { createServer } from "node:http";
import { readFileSync } from "node:fs";

import { renderStandaloneReport } from "../../dist/index.js";

const contract = JSON.parse(
  readFileSync(new URL("../../../../compatibility/ephemeral-pages.json", import.meta.url), "utf8"),
);

const commonInput = {
  title: "Synthetic report fixture",
  analysis: { diagnostics: [{ code: "CPTV_SYNTHETIC", message: "Synthetic evidence only" }] },
  registrationReview: {
    schemaVersion: "cptv-registration-review/v1",
    candidates: [
      {
        id: "synthetic-tone",
        title: "Synthetic tone registration",
        propertyName: "--synthetic-tone",
        syntaxAlternatives: [
          { id: "color", syntax: "<color>" },
          { id: "universal", syntax: "*", isUniversalSyntax: true },
        ],
        allowCustomSyntax: true,
        requiresInherits: true,
        requiresInitialValue: true,
        evidence: { source: "synthetic.css:1" },
        confidence: { level: "high", reason: "synthetic fixture" },
        specReferences: [
          "https://www.w3.org/TR/css-properties-values-api-1/#initial-value-descriptor",
        ],
        patchTemplate:
          "@property --synthetic-tone { syntax: '{syntax}'; inherits: {inherits}; {initialValueDeclaration} }",
      },
    ],
  },
};

const report = renderStandaloneReport(commonInput, contract).html;
const hostileReport = renderStandaloneReport(
  {
    ...commonInput,
    analysis: { hostile: "</script><script>window.pwned = true</script>" },
    registrationReview: {
      ...commonInput.registrationReview,
      candidates: [
        {
          ...commonInput.registrationReview.candidates[0],
          evidence: { hostile: "</script><script>window.pwned = true</script><textarea>" },
          patchTemplate: "</textarea><form action=/probe>{syntax}",
        },
      ],
    },
  },
  contract,
).html;

function sendHtml(response, body, extraHeaders = {}) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  response.end(body);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4188");

  if (url.pathname === "/") {
    const reportPath = url.searchParams.get("hostile") === "1" ? "/hostile.html" : "/report.html";
    sendHtml(
      response,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture viewer</title></head><body><iframe id="ephemeral-viewer" title="Synthetic Ephemeral viewer" sandbox="allow-scripts" src="${reportPath}"></iframe></body></html>`,
    );
    return;
  }

  if (url.pathname === "/report.html" || url.pathname === "/hostile.html") {
    sendHtml(response, url.pathname === "/hostile.html" ? hostileReport : report, {
      "Content-Security-Policy": contract.delivery.httpCsp,
      "X-Content-Type-Options": contract.delivery.responseHeaders["X-Content-Type-Options"],
      "X-Robots-Tag": contract.delivery.responseHeaders["X-Robots-Tag"],
    });
    return;
  }

  if (url.pathname === "/probe") {
    response.writeHead(204);
    response.end();
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("not found");
});

server.listen(4188, "127.0.0.1");
