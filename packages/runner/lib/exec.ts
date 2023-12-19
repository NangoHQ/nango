import type { NangoProps } from '@nangohq/shared';
import { NangoSync, NangoAction } from '@nangohq/shared';
import { Buffer } from 'buffer';
import * as vm from 'vm';
import * as url from 'url';
import * as crypto from 'crypto';

export async function exec(nangoProps: NangoProps, isInvokedImmediately: boolean, isWebhook: boolean, code: string, codeParams?: object): Promise<object> {
    const isAction = isInvokedImmediately && !isWebhook;
    const nango = isAction ? new NangoAction(nangoProps) : new NangoSync(nangoProps);
    const wrappedCode = `
                (function() {
                    var module = { exports: {} };
                    var exports = module.exports;
                    ${code}
                    return module.exports;
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
            },
            Buffer
        };
        const context = vm.createContext(sandbox);
        const scriptExports = script.runInContext(context);
        if (isWebhook) {
            if (!scriptExports.onWebhookPayloadReceived) {
                const content = `There is no onWebhookPayloadReceived export for ${nangoProps.syncId}`;

                throw new Error(content);
            }

            return await scriptExports.onWebhookPayloadReceived(nango, codeParams);
        } else {
            if (!scriptExports.default || typeof scriptExports.default !== 'function') {
                throw new Error(`Default exports is not a function but a ${typeof scriptExports.default}`);
            }
            if (isAction) {
                return await scriptExports.default(nango, codeParams);
            } else {
                return await scriptExports.default(nango);
            }
        }
    } catch (error) {
        throw new Error(`Error executing code '${error}'`);
    }
}
