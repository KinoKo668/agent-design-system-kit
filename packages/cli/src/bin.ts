#!/usr/bin/env node

import process from "node:process";

import { runCli } from "./index.js";

const result = await runCli(process.argv.slice(2));
process.stdout.write(result.output);
process.exitCode = result.exitCode;
