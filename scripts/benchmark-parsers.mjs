import { performance } from "node:perf_hooks";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import * as csstree from "css-tree";
import { transform } from "lightningcss";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpusDirectory = path.join(root, "fixtures", "parser-corpus");
const names = (await readdir(corpusDirectory)).filter((name) => name.endsWith(".css")).sort();
const corpus = [];
for (const name of names) {
  const filePath = path.join(corpusDirectory, name);
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.size > 5 * 1024 * 1024)
    throw new Error(`Corpus input is not a bounded regular file: ${name}`);
  const bytes = await readFile(filePath);
  if (bytes.byteLength > 5 * 1024 * 1024)
    throw new Error(`Corpus input exceeded the post-read limit: ${name}`);
  corpus.push({ name, bytes, text: bytes.toString("utf8") });
}

const iterations = Number.parseInt(process.env.CPTV_PARSER_BENCHMARK_ITERATIONS ?? "100", 10);
if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 10_000)
  throw new Error("Benchmark iterations must be between 1 and 10,000.");

const parsers = [
  {
    name: "css-tree",
    parse: (entry) => csstree.parse(entry.text, { positions: true, onParseError() {} }),
  },
  { name: "postcss", parse: (entry) => postcss.parse(entry.text, { from: entry.name }) },
  {
    name: "lightningcss",
    parse: (entry) => transform({ filename: entry.name, code: entry.bytes, errorRecovery: true }),
  },
];
const result = [];
for (const parser of parsers) {
  let failures = 0;
  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const entry of corpus) {
      try {
        parser.parse(entry);
      } catch {
        failures += 1;
      }
    }
  }
  result.push({
    parser: parser.name,
    documents: iterations * corpus.length,
    failures,
    elapsedMilliseconds: Number((performance.now() - start).toFixed(2)),
  });
}

console.log(
  JSON.stringify(
    {
      criterion: "AC-PARSER-001",
      node: process.version,
      iterations,
      corpus: names,
      capabilities: {
        "css-tree": [
          "stylesheet-and-value-ast",
          "source-locations",
          "syntax-definition-parser",
          "arbitrary-syntax-matcher",
          "property-grammar-matcher",
          "browser-javascript",
        ],
        postcss: [
          "stylesheet-ast",
          "source-locations",
          "string-declaration-values",
          "browser-javascript",
        ],
        lightningcss: ["stylesheet-parser-transformer", "diagnostics", "native-or-wasm-delivery"],
      },
      timingIsNormative: false,
      observations: result,
    },
    null,
    2,
  ),
);
