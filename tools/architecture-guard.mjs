#!/usr/bin/env node
/**
 * Architecture guard: enforce module dependency rules via AST.
 *
 * Rules:
 * 1. src/ may not import from tests/ or tools/.
 * 2. tests/ may import from src/ but not from other tests/ or tools/.
 * 3. tools/ may import from src/ but not from tests/.
 * 4. No file may import from outside the project root.
 * 5. No cyclic dependencies within src/.
 */

import { Project } from "ts-morph";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const project = new Project({
  tsConfigFilePath: path.join(rootDir, "tsconfig.json"),
});

const sourceFiles = project.getSourceFiles();
const errors = [];
const graph = new Map();

function normalize(p) {
  return path.relative(rootDir, p).replace(/\\/g, "/");
}

function moduleLayer(p) {
  const rel = normalize(p);
  if (rel.startsWith("src/")) return "src";
  if (rel.startsWith("tests/")) return "tests";
  if (rel.startsWith("tools/")) return "tools";
  return "other";
}

for (const sf of sourceFiles) {
  const fromPath = sf.getFilePath();
  const fromLayer = moduleLayer(fromPath);
  const imports = [];

  for (const decl of sf.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    if (!specifier.startsWith(".")) continue;

    const resolved = path.resolve(path.dirname(fromPath), specifier);
    const toPath = resolved.endsWith(".ts")
      ? resolved
      : resolved + ".ts";
    const toLayer = moduleLayer(toPath);

    // Rule 1: src may not import tests or tools.
    if (fromLayer === "src" && (toLayer === "tests" || toLayer === "tools")) {
      errors.push(`${normalize(fromPath)}: src must not import from ${toLayer} (${specifier})`);
    }

    // Rule 2: tests may not import other tests or tools.
    if (fromLayer === "tests" && (toLayer === "tests" || toLayer === "tools")) {
      errors.push(`${normalize(fromPath)}: tests must not import from ${toLayer} (${specifier})`);
    }

    // Rule 3: tools may not import tests.
    if (fromLayer === "tools" && toLayer === "tests") {
      errors.push(`${normalize(fromPath)}: tools must not import from tests (${specifier})`);
    }

    // Rule 4: no imports outside project.
    if (!toPath.startsWith(rootDir)) {
      errors.push(`${normalize(fromPath)}: import resolves outside project (${specifier})`);
    }

    if (fromLayer === "src" && toLayer === "src") {
      imports.push(normalize(toPath));
    }
  }

  graph.set(normalize(fromPath), imports);
}

// Rule 5: detect cycles within src/ using DFS.
function findCycles() {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  const parent = new Map();
  const cycles = [];

  for (const node of graph.keys()) {
    color.set(node, WHITE);
  }

  function dfs(node, stack) {
    color.set(node, GRAY);
    for (const next of graph.get(node) || []) {
      if (color.get(next) === GRAY) {
        const cycleStart = stack.indexOf(next);
        cycles.push([...stack.slice(cycleStart), next]);
      } else if (color.get(next) === WHITE) {
        dfs(next, [...stack, next]);
      }
    }
    color.set(node, BLACK);
  }

  for (const node of graph.keys()) {
    if (color.get(node) === WHITE) {
      dfs(node, [node]);
    }
  }

  return cycles;
}

const cycles = findCycles();
if (cycles.length > 0) {
  for (const cycle of cycles) {
    errors.push(`Cycle detected: ${cycle.join(" -> ")}`);
  }
}

if (errors.length > 0) {
  console.error("Architecture guard failed:");
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log("Architecture guard passed.");
