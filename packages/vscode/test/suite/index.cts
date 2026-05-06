import fs from "node:fs";
import path from "node:path";

import Mocha from "mocha";

// The extension package is ESM, but @vscode/test-electron loads the suite
// module through CommonJS. Keeping the suite entry as .cts gives it a CJS
// output file without changing the extension's runtime module type.
function collectTestFiles(directory: string): string[] {
  const testFiles: string[] = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      testFiles.push(...collectTestFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.cjs")) {
      testFiles.push(entryPath);
    }
  }

  return testFiles;
}

export function run(): Promise<void> {
  const mocha = new Mocha({
    color: true,
    timeout: 10000,
    ui: "tdd",
  });

  for (const file of collectTestFiles(__dirname)) {
    mocha.addFile(file);
  }

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} test failure${failures === 1 ? "" : "s"}`));
        return;
      }

      resolve();
    });
  });
}
