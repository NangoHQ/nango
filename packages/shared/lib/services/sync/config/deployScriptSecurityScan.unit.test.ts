import { describe, expect, it } from 'vitest';

import { scanCompiledDeployScript } from './deployScriptSecurityScan.js';

import type { DeployScriptScanHit, DeployScriptScanResult } from './deployScriptSecurityScan.js';

/** Deploy scripts that invoke code via `Function.prototype` / `*.constructor` must be rejected. */
function expectRejectsConstructorGadget(source: string): void {
    const r = scanCompiledDeployScript(source);
    assertFailedScanIsConstructorRule(r);
}

function assertFailedScanIsConstructorRule(
    r: DeployScriptScanResult
): asserts r is { ok: false; rule: 'constructor_string_call'; hits: DeployScriptScanHit[] } {
    if (r.ok) {
        throw new Error('expected deploy script to be rejected');
    }
    if (r.rule === 'parse_error') {
        throw new Error(r.message);
    }
    expect(r.rule).toBe('constructor_string_call');
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every((h) => h.rule === 'constructor_string_call')).toBe(true);
}

describe('scanCompiledDeployScript', () => {
    describe('rejects Function-constructor gadgets (.constructor / ["constructor"] with a payload)', () => {
        it.each([
            [
                'string literal payload on Error.constructor',
                `
exec: async () => {
  return Error.constructor("return this.process")().env;
}
`
            ],
            [
                'payload passed via a variable (not a literal in the call)',
                `
exec: async () => {
  const someVar = "return this.process";
  return obj.constructor(someVar)().env;
}
`
            ],
            [
                'payload built with string concatenation',
                `
exec: async () => {
  return Error.constructor("return pro" + "cess")().env;
}
`
            ],
            [
                'constructor function aliased then invoked',
                `
exec: async () => {
  const myConstructor = obj.constructor;
  return myConstructor('...')().env;
}
`
            ],
            [
                'bracket property access with a string literal key ("constructor")',
                `
exec: async () => {
  return obj["constructor"]("return this.process")().env;
}
`
            ],
            [
                'template literal payload (no interpolations)',
                `
exec: async () => {
  return Error.constructor(\`return this.process\`)().env;
}
`
            ],
            [
                'alias bound with let',
                `
exec: async () => {
  let c = obj.constructor;
  return c("return this.process")().env;
}
`
            ]
        ])('%s', (_name, source) => {
            expectRejectsConstructorGadget(source);
        });

        it('rejects every occurrence in the file (multiple independent gadgets)', () => {
            const r = scanCompiledDeployScript(`
exec: async () => {
  Error.constructor("a")();
  return Thing.constructor("b")();
}
`);
            assertFailedScanIsConstructorRule(r);
            expect(r.hits.length).toBe(2);
        });
    });

    describe('allows ordinary deploy / bundler output that does not invoke a code-string constructor', () => {
        it('minimal CJS export', () => {
            const r = scanCompiledDeployScript(`
"use strict";
module.exports = { default: async function() { return { ok: true }; } };
`);
            expect(r).toEqual({ ok: true });
        });

        it('typical getPrototypeOf helper prelude', () => {
            const r = scanCompiledDeployScript(`
var __getProtoOf = Object.getPrototypeOf;
var x = __getProtoOf(mod);
`);
            expect(r).toEqual({ ok: true });
        });

        it('.constructor() called with no payload argument', () => {
            const r = scanCompiledDeployScript(`
exec: () => {
  return obj.constructor();
}
`);
            expect(r).toEqual({ ok: true });
        });
    });
});
