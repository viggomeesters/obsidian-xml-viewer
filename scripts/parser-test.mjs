import assert from "node:assert/strict";
import fs from "node:fs";
import esbuild from "esbuild";
import { DOMParser } from "@xmldom/xmldom";

globalThis.Node = {
  ELEMENT_NODE: 1,
  ATTRIBUTE_NODE: 2,
  TEXT_NODE: 3,
  CDATA_SECTION_NODE: 4,
  PROCESSING_INSTRUCTION_NODE: 7,
  COMMENT_NODE: 8,
  DOCUMENT_NODE: 9,
  DOCUMENT_TYPE_NODE: 10,
};

await esbuild.build({
  bundle: true,
  entryPoints: ["src/parser.ts"],
  format: "esm",
  outfile: ".tmp-parser-test.mjs",
  platform: "node",
  target: "node20",
});

const { parseXml } = await import(new URL("../.tmp-parser-test.mjs", import.meta.url));
const parser = new DOMParser({
  errorHandler: {
    warning() {},
    error(message) {
      throw new Error(message);
    },
    fatalError(message) {
      throw new Error(message);
    },
  },
});

function readFixture(name) {
  return fs.readFileSync(new URL(`../test-fixtures/${name}`, import.meta.url), "utf8");
}

function treeContains(node, text) {
  return node.searchText.includes(text) || node.children.some((child) => treeContains(child, text));
}

const simple = parseXml(readFixture("simple.xml"), parser);
assert.equal(simple.isMalformed, false);
assert.ok(simple.root);
assert.ok(simple.nodeCount >= 6);
const note = simple.root.children.find((child) => child.name === "note");
assert.ok(note);
const to = note.children.find((child) => child.name === "to");
assert.ok(to);
assert.equal(to.textPreview, "Tove");

const namespaces = parseXml(readFixture("namespaces.xml"), parser);
assert.equal(namespaces.isMalformed, false);
const catalog = namespaces.root.children.find((child) => child.name === "catalog");
assert.ok(catalog);
assert.equal(catalog.attributes[0].name, "xmlns:cfg");
assert.ok(catalog.children.some((child) => child.name === "cfg:item"));

const soap = parseXml(readFixture("soap.xml"), parser);
assert.equal(soap.isMalformed, false);
assert.ok(soap.root.children.some((child) => child.name === "soap:Envelope"));
assert.ok(treeContains(soap.root, "getstatusresponse"));

const nodes = parseXml(readFixture("nodes.xml"), parser);
assert.equal(nodes.isMalformed, false);
assert.ok(treeContains(nodes.root, "#comment"));
assert.ok(treeContains(nodes.root, "#cdata"));
assert.ok(treeContains(nodes.root, "?xml-stylesheet"));

const malformed = parseXml(readFixture("malformed.xml"), {
  parseFromString() {
    throw new Error("Opening and ending tag mismatch");
  },
});
assert.equal(malformed.isMalformed, true);
assert.ok(malformed.warnings.some((warning) => warning.label === "Parse error"));

const empty = parseXml(readFixture("empty.xml"), parser);
assert.equal(empty.nodeCount, 0);
assert.equal(empty.root, null);

const largeXml = `<root>${Array.from({ length: 10005 }, (_, index) => `<item id="${index}">value ${index}</item>`).join("")}</root>`;
const large = parseXml(largeXml, parser, 10000);
assert.equal(large.renderedNodeCount, 10000);
assert.ok(large.skippedNodes > 0);
assert.ok(large.warnings.some((warning) => warning.label === "Render cap"));

fs.rmSync(new URL("../.tmp-parser-test.mjs", import.meta.url));
console.log("XML parser fixture tests passed.");
