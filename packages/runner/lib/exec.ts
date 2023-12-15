import type { NangoProps } from '@nangohq/shared';
import { NangoSync } from '@nangohq/shared';
import * as vm from 'vm';
import * as url from 'url';
import * as crypto from 'crypto';

export async function exec(nangoProps: NangoProps, isAction: boolean, code: string, codeParams?: object): Promise<object> {
    const nangoSync = new NangoSync(nangoProps);
    const wrappedCode = `
                (function() {
                    var module = { exports: {} };
                    var exports = module.exports;
                    ${code}
                    return module.exports.default || module.exports;
                })();
            `;

    try {
        const script = new vm.Script(wrappedCode);
        const sandbox = {
            console,
            require: (moduleName: string) => {
                switch (moduleName) {
                    case 'url':
                        return url;
                    case 'crypto':
                        return crypto;
                    default:
                        throw new Error(`Module '${moduleName}' is not allowed`);
                }
            }
        };
        const context = vm.createContext(sandbox);
        const f = script.runInContext(context);
        if (!f || typeof f !== 'function') {
            throw new Error(`Default exports is not a function but a ${typeof f}`);
        }
        if (isAction) {
            return await f(nangoSync, codeParams);
        } else {
            return await f(nangoSync);
        }
    } catch (error) {
        throw new Error(`Error executing code '${error}'`);
    }
}
