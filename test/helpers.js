"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FIXTURES = path.join(__dirname, "fixtures");
const NOW = Date.parse("2026-10-31T10:00:00Z");

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

// A JWT-shaped string with a readable payload; the signature part is fake.
function fakeJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(payload)}.signature`;
}

// Records requests and answers with a canned status/body, or throws a canned error.
function fakeFetch({ status = 200, body = null, error = null } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, headers: init.headers || {} });
    if (error) throw error;
    return new Response(body === null ? "" : JSON.stringify(body), { status });
  };
  fn.calls = calls;
  return fn;
}

// readFile stand-in backed by an in-memory map of absolute paths.
function fakeFiles(files) {
  return async (file) => {
    if (Object.prototype.hasOwnProperty.call(files, file)) return files[file];
    const error = new Error(`ENOENT: ${file}`);
    error.code = "ENOENT";
    throw error;
  };
}

module.exports = { FIXTURES, NOW, fixture, fakeJwt, fakeFetch, fakeFiles, now: () => NOW };
