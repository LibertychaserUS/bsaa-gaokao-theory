#!/usr/bin/env node
/**
 * Architecture guard: enforce module dependency rules via AST.
 *
 * Layer rules:
 * - src/domain: no imports from src/application, src/ports, src/adapters, src/db.ts
 * - src/ports: no imports from src/application, src/adapters, src/db.ts
 * - src/application: may import src/domain and src/ports; not src/adapters or src/db.ts
 * - src/adapters: may import any src/ layer
 * - src/db.ts: treated as adapter-level facade
 * - src/schemas.ts: shared across all layers
 * - tests/ may import src/ but not other tests/ or tools/
 * - tools/ may import src/ but not tests/
 * - No imports outside the project root.
 * - No cyclic dependencies within src/.
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

function moduleKind(p) {
  const rel = normalize(p);
  if (rel.startsWith("src/domain/")) return "domain";
  if (rel.startsWith("src/ports/")) return "ports";
  if (rel.startsWith("src/application/")) return "application";
  if (rel.startsWith("src/adapters/")) return "adapters";
  if (rel === "src/db.ts") return "adapters";
  if (rel === "src/schemas.ts") return "schemas";
  if (rel.startsWith("src/")) return "src-other";
  if (rel.startsWith("tests/")) return "tests";
  if (rel.startsWith("tools/")) return "tools";
  return "other";
}

const srcKinds = new Set(["domain", "ports", "application", "adapters", "schemas", "src-other"]);

function isInModuleLayer(targetKind, layer) {
  if (targetKind === "schemas") return true; // shared schemas allowed everywhere
  if (layer === "domain") return targetKind === "domain";
  if (layer === "ports") return targetKind === "ports";
  if (layer === "application") return targetKind === "application" || targetKind === "domain" || targetKind === "ports";
  if (layer === "adapters") return srcKinds.has(targetKind);
  if (layer === "src-other") return srcKinds.has(targetKind);
  if (layer === "tests") return srcKinds.has(targetKind);
  if (layer === "tools") return srcKinds.has(targetKind);
  return true;
}

for (const sf of sourceFiles) {
  const fromPath = sf.getFilePath();
  const fromKind = moduleKind(fromPath);
  const imports = [];

  for (const decl of sf.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    if (!specifier.startsWith(".")) continue;

    const resolved = path.resolve(path.dirname(fromPath), specifier);
    const toPath = resolved.endsWith(".js")
      ? resolved.slice(0, -3) + ".ts"
      : resolved.endsWith(".ts")
        ? resolved
        : resolved + ".ts";
    const toKind = moduleKind(toPath);

    // Cross-layer rule checks.
    if (!isInModuleLayer(toKind, fromKind)) {
      errors.push(
        `${normalize(fromPath)} (${fromKind}) must not import ${toKind} (${specifier})`,
      );
    }

    // No imports outside project.
    if (!toPath.startsWith(rootDir)) {
      errors.push(`${normalize(fromPath)}: import resolves outside project (${specifier})`);
    }

    if (fromKind.startsWith("src") && toKind.startsWith("src")) {
      imports.push(normalize(toPath));
    }
  }

  graph.set(normalize(fromPath), imports);
}

// Detect cycles within src/ using DFS.
function findCycles() {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
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
