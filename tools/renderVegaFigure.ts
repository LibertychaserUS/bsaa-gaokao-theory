/**
 * Render a Vega-Lite specification to an SVG file.
 *
 * Usage: npx tsx tools/renderVegaFigure.ts <vl-spec.json> <output.svg>
 */

import { readFileSync, writeFileSync } from "node:fs";
import * as vega from "vega";
import * as vegaLite from "vega-lite";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) {
  console.error("Usage: npx tsx tools/renderVegaFigure.ts <vl-spec.json> <output.svg>");
  process.exit(1);
}

const vlSpec = JSON.parse(readFileSync(inputPath, "utf-8")) as vegaLite.TopLevelSpec;
const vgSpec = vegaLite.compile(vlSpec).spec;
const view = new vega.View(vega.parse(vgSpec), { renderer: "none" });
const svg = await view.toSVG();
writeFileSync(outputPath, svg);
console.log(`Rendered ${outputPath}`);
