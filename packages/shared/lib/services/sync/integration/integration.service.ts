import { getQuickJS, QuickJSHandle } from 'quickjs-emscripten';
import type { Context } from 'vm';
import type { NangoIntegrationData } from '../../../integrations/index.js';
import { getIntegrationFile } from '../../nango-config.service.js';
import { createActivityLogMessage } from '../../activity/activity.service.js';
import type { NangoSync } from '../../../sdk/sync.js';
import fileService from '../../file.service.js';
import { isCloud } from '../../../utils/utils.js';
import { classToObject, createConsoleLog, createRequireMethod, hostToQuickJSHandle, quickJSHandleToHost } from './utils.js';

const memoryLimit = 500;

class IntegrationService {
    async compile(code: string, sandbox: Context): Promise<any> {
        const quickJs = await getQuickJS();
        const runtime = quickJs.newRuntime();
        runtime.setMemoryLimit(1024 * 1024 * 500);

        const vm = runtime.newContext();

        createConsoleLog(vm);
        createRequireMethod(vm);

        if (sandbox) {
            for (const [name, value] of Object.entries(sandbox)) {
                const fnHandle = vm.newFunction(name, (...args: any[]) => {
                    const result = value(...args.map((arg) => quickJSHandleToHost(vm, arg)));

                    vm.runtime.executePendingJobs();

                    return hostToQuickJSHandle(vm, result);
                });

                fnHandle.consume((handle: any) => vm.setProp(vm.global, name, handle));
            }
        }

        const wrappedScript = `
(function() {
    var module = { exports: {} };
    var exports = module.exports;
    ${code}
    return module.exports.default || module.exports;
})();
`;

        const fnResult = vm.evalCode(wrappedScript);
        const fn = vm.unwrapResult(fnResult);

        const returnFunction = async function (...args: unknown[]): Promise<any> {
            let promiseHandle: QuickJSHandle | undefined;
            let resolvedHandle: QuickJSHandle | undefined;
            try {
                const result = vm.callFunction(fn, vm.undefined, ...args.map((arg: unknown) => hostToQuickJSHandle(vm, arg)));
                promiseHandle = vm.unwrapResult(result);
                const resolvedResultP = vm.resolvePromise(promiseHandle);
                vm.runtime.executePendingJobs();
                const resolvedResult = await resolvedResultP;
                resolvedHandle = vm.unwrapResult(resolvedResult);
                return quickJSHandleToHost(vm, resolvedHandle);
            } catch (err: unknown) {
                if (err && typeof err === 'object' && 'cause' in err && err.cause) {
                    if (
                        typeof err.cause === 'object' &&
                        'stack' in err.cause &&
                        'name' in err.cause &&
                        'message' in err.cause &&
                        typeof err.cause.stack === 'string' &&
                        typeof err.cause.name === 'string' &&
                        typeof err.cause.message === 'string'
                    ) {
                        err.cause.stack = `${err.cause.name}: ${err.cause.message}\n${err.cause.stack}`;
                    }
                    throw err.cause;
                }
                throw err;
            } finally {
                promiseHandle?.dispose();
                resolvedHandle?.dispose();
            }
        };

        return { fn: returnFunction };
    }

    async runScript(
        syncName: string,
        activityLogId: number | undefined,
        nango: NangoSync,
        integrationData: NangoIntegrationData,
        environmentId: number,
        writeToDb: boolean,
        isAction: boolean,
        optionalLoadLocation?: string,
        input?: object
    ): Promise<any> {
        try {
            const script: string | null =
                isCloud() && !optionalLoadLocation
                    ? await fileService.getFile(integrationData.fileLocation as string, environmentId)
                    : getIntegrationFile(syncName, optionalLoadLocation);

            if (!script) {
                const content = `Unable to find integration file for ${syncName}`;

                if (activityLogId && writeToDb) {
                    await createActivityLogMessage({
                        level: 'error',
                        activity_log_id: activityLogId,
                        content,
                        timestamp: Date.now()
                    });
                } else {
                    console.error(content);
                }
                return null;
            }

            try {
                const { fn } = await this.compile(script, { nango });
                const nangoObject = classToObject(nango);
                const results = isAction ? await fn(nangoObject, input) : await fn(nangoObject);

                return results;
            } catch (err: any) {
                let content;
                let isMemoryLimitError = false;

                if (err.toString().includes('Aborted()')) {
                    isMemoryLimitError = true;
                }

                if ('response' in err && 'data' in err.response) {
                    const message = JSON.stringify(err.response.data, null, 2);
                    content = `The script failed to execute for ${syncName} with the following error: ${message}`;
                } else {
                    const prettyError = JSON.stringify(err, ['message', 'name', 'stack'], 2);

                    const errorMessage = typeof err === 'object' && Object.keys(err as object).length > 0 ? prettyError : String(err);
                    content = `The script failed to execute for ${syncName} with the following error: ${errorMessage}`;
                }

                if (isMemoryLimitError) {
                    content += `\n\nThe script has exceeded the memory limit of ${memoryLimit}mb. Please reduce the amount of data being processed.`;
                }

                if (activityLogId && writeToDb) {
                    await createActivityLogMessage({
                        level: 'error',
                        activity_log_id: activityLogId,
                        content,
                        timestamp: Date.now()
                    });
                } else {
                    console.error(content);
                }

                return null;
            }
        } catch (err) {
            const errorMessage = JSON.stringify(err, ['message', 'name', 'stack'], 2);
            const content = `The script failed to load for ${syncName} with the following error: ${errorMessage}`;

            if (activityLogId && writeToDb) {
                await createActivityLogMessage({
                    level: 'error',
                    activity_log_id: activityLogId,
                    content,
                    timestamp: Date.now()
                });
            } else {
                console.error(content);
            }

            return null;
        }
    }
}

export default new IntegrationService();
