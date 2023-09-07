import { getQuickJS, QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';
import { types } from 'util';
import type { Context } from 'vm';
import type { NangoIntegrationData } from '../../../integrations/index.js';
import { getIntegrationFile } from '../../nango-config.service.js';
import { createActivityLogMessage } from '../../activity/activity.service.js';
import type { NangoSync } from '../../../sdk/sync.js';
import fileService from '../../file.service.js';
import { isCloud } from '../../../utils/utils.js';

function isClassInstance(obj: object) {
    // Ensure obj is truthy and its type is 'object'
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    // Get the prototype of the object
    const proto = Object.getPrototypeOf(obj);

    // If the prototype is null or Object.prototype, it's not a class instance
    if (proto === null || proto === Object.prototype) {
        return false;
    }

    // Check if the prototype's constructor is a class
    return typeof proto.constructor === 'function' && /^class\s/.test(proto.constructor.toString());
}

function classToObject(instance: any): any {
    if (!isClassInstance(instance)) {
        return instance;
    }

    const obj: any = {};

    // Copy methods and properties from the instance to the new object
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(instance))) {
        if (typeof instance[key] === 'function') {
            obj[key] = instance[key].bind(instance); // Bind the method to the original instance
        } else {
            obj[key] = instance[key];
        }
    }

    return obj;
}

function hostConsoleLog(...args: any[]): void {
    console.log(...args);
}

function createConsoleLog(vm: QuickJSContext): void {
    const globalObject = vm.global;

    const logFn = vm.newFunction('log', (...args: any[]) => {
        hostConsoleLog(...args.map((arg) => quickJSHandleToHost(vm, arg)));
        return vm.undefined;
    });

    const consoleObject = vm.newObject();
    vm.setProp(consoleObject, 'log', logFn);

    vm.setProp(globalObject, 'console', consoleObject);

    logFn.dispose();
    consoleObject.dispose();
    globalObject.dispose();
}

function quickJSHandleToHost(vm: QuickJSContext, val: QuickJSHandle) {
    return vm.dump(val);
}

function handlePropertyOrMethod(vm: QuickJSContext, key: string, obj: any, objHandle: any) {
    if (typeof obj[key] === 'function') {
        const fnHandle = vm.newFunction(key, (...args: any[]) => {
            const hostArgs = args.map((arg) => quickJSHandleToHost(vm, arg));
            const result = obj[key](...hostArgs);
            return hostToQuickJSHandle(vm, result);
        });
        vm.setProp(objHandle, key, fnHandle);
        fnHandle.dispose();
    } else {
        const propHandle = hostToQuickJSHandle(vm, obj[key]);
        vm.setProp(objHandle, key, propHandle);
        propHandle.dispose(); // Dispose the handle to prevent memory leaks
    }
}

function hostToQuickJSHandle(vm: QuickJSContext, val: unknown, isDataProperty = false): QuickJSHandle {
    if (typeof val === 'object' && val !== null && 'data' in val && !isDataProperty) {
        return hostToQuickJSHandle(vm, { data: (val as any).data }, true);
    }

    if (typeof val === 'undefined') {
        return vm.undefined;
    } else if (val === null) {
        return vm.null;
    } else if (typeof val === 'string') {
        return vm.newString(val);
    } else if (typeof val === 'number') {
        return vm.newNumber(val);
    } else if (typeof val === 'bigint') {
        return vm.newBigInt(val);
    } else if (typeof val === 'boolean') {
        return val ? vm.true : vm.false;
    } else if (Array.isArray(val)) {
        const arrHandle = vm.newArray();
        val.forEach((item, index) => {
            const itemHandle = hostToQuickJSHandle(vm, item);
            vm.setProp(arrHandle, index.toString(), itemHandle);
            itemHandle.dispose(); // Dispose the handle to prevent memory leaks
        });
        return arrHandle;
    } else if (types.isPromise(val)) {
        const promise = vm.newPromise();
        promise.settled.then(vm.runtime.executePendingJobs);
        val.then(
            (r: unknown) => {
                promise.resolve(hostToQuickJSHandle(vm, r));
            },
            (err: unknown) => {
                promise.reject(hostToQuickJSHandle(vm, err));
            }
        );
        return promise.handle;
    } else if (typeof val === 'function') {
        const fnHandle = vm.newFunction(val.name || 'anonymous', (...args: any[]) => {
            const hostArgs = args.map((arg) => quickJSHandleToHost(vm, arg));
            const result = val(...hostArgs);
            return hostToQuickJSHandle(vm, result);
        });
        return fnHandle;
    } else if (types.isNativeError(val)) {
        return vm.newError(val);
    } else if (typeof val === 'object' && !Array.isArray(val)) {
        const objHandle = vm.newObject();

        for (const key in val) {
            if (Object.prototype.hasOwnProperty.call(val, key)) {
                handlePropertyOrMethod(vm, key, val, objHandle);
            }
        }

        const proto = Object.getPrototypeOf(val);
        for (const key in proto) {
            if (Object.prototype.hasOwnProperty.call(proto, key) && typeof proto[key] === 'function') {
                handlePropertyOrMethod(vm, key, proto, objHandle);
            }
        }

        return objHandle;
    }

    throw new Error(`Unsupported value: ${val}`);
}

class IntegrationService {
    async compile(code: string, sandbox: Context): Promise<any> {
        const quickJs = await getQuickJS();
        const vm = quickJs.newContext();

        createConsoleLog(vm);

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
    var exports = typeof exports !== 'undefined' ? exports : {};
    ${code}
    return typeof fetchData !== 'undefined' ? fetchData : exports.default;
})();
`;
        const fnResult = vm.evalCode(wrappedScript);
        const fn = vm.unwrapResult(fnResult);

        const returnFunction = async function (...args: any): Promise<any> {
            let promiseHandle: QuickJSHandle | undefined;
            let resolvedHandle: QuickJSHandle | undefined;
            try {
                const result = vm.callFunction(fn, vm.undefined, ...args.map((arg: any) => hostToQuickJSHandle(vm, arg)));
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

        return returnFunction;
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
                const fn = await this.compile(script, { nango });
                const nangoObject = classToObject(nango);
                const results = isAction ? await fn(nangoObject, input) : await fn(nangoObject);

                return results;
            } catch (err: any) {
                let content;
                if ('response' in err && 'data' in err.response) {
                    const message = JSON.stringify(err.response.data, null, 2);
                    content = `The script failed to execute for ${syncName} with the following error: ${message}`;
                } else {
                    const prettyError = JSON.stringify(err, ['message', 'name', 'stack'], 2);

                    const errorMessage = typeof err === 'object' && Object.keys(err as object).length > 0 ? prettyError : String(err);
                    content = `The script failed to execute for ${syncName} with the following error: ${errorMessage}`;
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
