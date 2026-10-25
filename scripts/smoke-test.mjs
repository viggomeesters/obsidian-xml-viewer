import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const releasePackage = JSON.parse(fs.readFileSync("package.json", "utf8"));
const releaseVersions = JSON.parse(fs.readFileSync("versions.json", "utf8"));
const main = fs.readFileSync("src/main.ts", "utf8");
const parser = fs.readFileSync("src/parser.ts", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

const assertions = [
  [manifest.id === "xml-viewer", "manifest id is xml-viewer"],
  [manifest.version === releasePackage.version && /^\d+\.\d+\.\d+$/.test(manifest.version) && releaseVersions[manifest.version] === manifest.minAppVersion, "release version matches package and supported app version"],
  [!/obsidian/i.test(manifest.description), "manifest description avoids product name"],
  [main.includes("registerExtensions(XML_EXTENSIONS"), "extensions are registered"],
  [main.includes("type ViewMode = \"tree\" | \"source\""), "tree/source mode exists"],
  [main.includes("renderTree(container, parsed, this.filterValue)"), "tree view code path exists"],
  [main.includes("renderSource(container, this.data)"), "source view code path exists"],
  [main.includes("parsed.isMalformed"), "malformed XML falls back to source view"],
  [parser.includes("RENDER_NODE_LIMIT = 10000"), "render cap exists"],
  [parser.includes("parseFromString(data, \"application/xml\")"), "DOMParser XML parsing is used"],
  [parser.includes("PROCESSING_INSTRUCTION_NODE"), "processing instructions are handled"],
  [parser.includes("CDATA_SECTION_NODE"), "CDATA is handled"],
  [!main.includes("navigator.clipboard") && !parser.includes("navigator.clipboard"), "no clipboard access"],
  [!main.includes("fetch(") && !parser.includes("fetch("), "no fetch usage"],
  [!main.includes("XMLHttpRequest") && !parser.includes("XMLHttpRequest"), "no XMLHttpRequest usage"],
  [!main.includes("WebSocket") && !parser.includes("WebSocket"), "no WebSocket usage"],
  [!styles.includes("!important"), "styles do not use important overrides"],
];

const failures = assertions.filter(([passes]) => !passes).map(([, label]) => label);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log("XML Viewer smoke checks passed.");
