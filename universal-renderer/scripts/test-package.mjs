import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const esmMain = await import("universal-renderer");
const esmHttp = await import("universal-renderer/http");
const cjsMain = require("universal-renderer");
const cjsHttp = require("universal-renderer/http");

for (const entry of [esmMain, esmHttp, cjsMain, cjsHttp]) {
  assert.equal(typeof entry.createServer, "function");
}

console.log("ESM and CommonJS package entry points are valid");
