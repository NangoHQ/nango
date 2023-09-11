import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';
import { types } from 'util';

type GenericFunction = (...args: unknown[]) => unknown;

export function hostConsoleLog(...args: unknown[]): void {
    console.log(...args);
}

export function isClassInstance(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    const proto = Object.getPrototypeOf(obj);

    if (proto === null || proto === Object.prototype) {
        return false;
    }

    return typeof proto.constructor === 'function' && /^class\s/.test(proto.constructor.toString());
}

export function classToObject(instance: object): Record<string, unknown> {
    if (!isClassInstance(instance)) {
        return instance as Record<string, unknown>;
    }

    const obj: Record<string, unknown> = {};

    const keys = [...Object.getOwnPropertyNames(instance), ...Object.getOwnPropertyNames(Object.getPrototypeOf(instance))];

    for (const key of keys) {
        const value = (instance as Record<string, unknown>)[key];
        if (typeof value === 'function') {
            obj[key] = value.bind(instance);
        } else {
            obj[key] = value;
        }
    }

    return obj;
}

export function createConsoleLog(vm: QuickJSContext): void {
    const globalObject = vm.global;

    const logFn = vm.newFunction('log', (...args: QuickJSHandle[]) => {
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

export function quickJSHandleToHost(vm: QuickJSContext, val: QuickJSHandle) {
    return vm.dump(val);
}

export function handlePropertyOrMethod(vm: QuickJSContext, key: string, obj: Record<string, unknown>, objHandle: QuickJSHandle) {
    const value = obj[key];
    if (typeof value === 'function') {
        const fnHandle = vm.newFunction(key, (...args: QuickJSHandle[]) => {
            const hostArgs = args.map((arg) => quickJSHandleToHost(vm, arg));
            const result = (value as GenericFunction)(...hostArgs);
            return hostToQuickJSHandle(vm, result);
        });
        vm.setProp(objHandle, key, fnHandle);
        fnHandle.dispose();
    } else {
        const propHandle = hostToQuickJSHandle(vm, value);
        vm.setProp(objHandle, key, propHandle);
        propHandle.dispose();
    }
}

export function hostToQuickJSHandle(vm: QuickJSContext, val: unknown, isDataProperty = false): QuickJSHandle {
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
            itemHandle.dispose();
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
                handlePropertyOrMethod(vm, key, val as Record<string, unknown>, objHandle);
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
