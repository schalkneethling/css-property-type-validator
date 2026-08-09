# Browser-contract test harness

`pnpm run test:browser` exercises synthetic reports in Chromium under the pinned service-effective
HTTP CSP and a sandboxed iframe. The package declares the repository-pinned Playwright version
directly, and CI installs Chromium before running the root `test:report:browser` gate. The test
server is synthetic; it never uploads reports or processes repository CSS.
