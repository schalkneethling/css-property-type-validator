// @generated from compatibility/ephemeral-pages.json by scripts/generate-ephemeral-contract.mjs.
import type { EphemeralPagesContract } from "@schalkneethling/css-property-type-validator-report";

export const EPHEMERAL_PAGES_CONTRACT = {
  "schemaVersion": "1.0",
  "compatibilityVersion": "1.0",
  "upstream": {
    "repository": "https://github.com/schalkneethling/ephemeral-pages",
    "commit": "9b11df2a1f9b8b4ea05c74034e5c76f6a5a0841d",
    "checkedAt": "2026-09-01",
    "sources": [
      {
        "path": "src/csp.ts",
        "blobSha": "dba85afa46949eed9f3960ea6723551923f86741"
      },
      {
        "path": "src/domain.ts",
        "blobSha": "e68f8600f424cfc816a0790bca00b9ba6dcd713b"
      },
      {
        "path": "netlify/functions/html-validation.ts",
        "blobSha": "9b9f368f4c90955402747a32978de18578e11834"
      },
      {
        "path": "netlify/functions/pages.ts",
        "blobSha": "20d486bb562953a2665f78d71d6c6fafa51827cd"
      }
    ]
  },
  "delivery": {
    "httpCsp": "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data: blob:; media-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'",
    "viewerIframeSandbox": "allow-scripts",
    "requiredAuthoredElements": [
      "html",
      "head"
    ],
    "responseHeaders": {
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex"
    },
    "uploadLimits": {
      "rawHtmlBytes": 20971520,
      "brotliCompressedHtmlBytes": 2097152
    },
    "supportedTtlHours": [
      1,
      3,
      5,
      7,
      12,
      24,
      72,
      120,
      168
    ]
  }
} as const satisfies EphemeralPagesContract;
