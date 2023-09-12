import { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';
import crypto from 'crypto';
import { types } from 'util';

type GenericFunction = (...args: unknown[]) => unknown;

export function hostConsoleLog(...args: unknown[]): void {
    console.log(...args);
}

export function hostRequire(moduleName: string): unknown {
    return require(moduleName);
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

export function createRequireMethod(vm: QuickJSContext): void {
    const globalObject = vm.global;

    const requireFn = vm.newFunction('require', (moduleName: QuickJSHandle) => {
        const hostModuleName = quickJSHandleToHost(vm, moduleName);
        const moduleExports = hostRequire(hostModuleName);
        return hostToQuickJSHandle(vm, moduleExports);
    });

    vm.setProp(globalObject, 'require', requireFn);

    requireFn.dispose();
    globalObject.dispose();
}

export function createHashBridge(algorithm: string, data: string): string {
    const hash = crypto.createHash(algorithm);
    hash.update(data);
    return hash.digest('hex');
}

export function createCryptoHash(vm: QuickJSContext): void {
    const globalObject = vm.global;

    const createHashFn = vm.newFunction('createHash', (algorithm: QuickJSHandle) => {
        const hostAlgorithm = quickJSHandleToHost(vm, algorithm);
        const hash = crypto.createHash(hostAlgorithm);

        const hashObject = vm.newObject();

        const updateFn = vm.newFunction('update', (data: QuickJSHandle) => {
            const hostData = quickJSHandleToHost(vm, data);
            hash.update(hostData);
            return vm.undefined;
        });

        const digestFn = vm.newFunction('digest', (encoding: QuickJSHandle) => {
            const hostEncoding = quickJSHandleToHost(vm, encoding);
            const result = hash.digest(hostEncoding);
            return hostToQuickJSHandle(vm, result);
        });

        vm.setProp(hashObject, 'update', updateFn);
        vm.setProp(hashObject, 'digest', digestFn);

        updateFn.dispose();
        digestFn.dispose();

        return hashObject;
    });

    vm.setProp(globalObject, 'createHash', createHashFn);

    createHashFn.dispose();
    globalObject.dispose();
}

export function quickJSHandleToHost(vm: QuickJSContext, val: QuickJSHandle) {
    return vm.dump(val);
}

export function handlePropertyOrMethod(vm: QuickJSContext, key: string, obj: Record<string, unknown>, objHandle: QuickJSHandle, depth: number) {
    const value = obj[key];
    if (typeof value === 'function') {
        const fnHandle = vm.newFunction(key, (...args: QuickJSHandle[]) => {
            const hostArgs = args.map((arg) => quickJSHandleToHost(vm, arg));
            const result = (value as GenericFunction)(...hostArgs);
            return hostToQuickJSHandle(vm, result, depth + 1);
        });
        vm.setProp(objHandle, key, fnHandle);
        fnHandle.dispose();
    } else {
        const propHandle = hostToQuickJSHandle(vm, value, depth + 1);
        vm.setProp(objHandle, key, propHandle);
        propHandle.dispose();
    }
}

export function hostToQuickJSHandle(vm: QuickJSContext, val: unknown, depth = 0): QuickJSHandle {
    if (depth >= 10) {
        return vm.undefined;
    }

    const hashObjects: { [id: string]: crypto.Hash } = {};

    if (val === crypto) {
        const cryptoObjHandle = vm.newObject();

        const createHashFn = vm.newFunction('createHash', (algorithmHandle: QuickJSHandle) => {
            const algorithm = quickJSHandleToHost(vm, algorithmHandle);

            const hashObjHandle = vm.newObject();

            const hash = crypto.createHash(algorithm);
            const hashId = `${Date.now()}-${Math.random()}`;
            hashObjects[hashId] = hash;

            vm.setProp(hashObjHandle, '_hashId', vm.newString(hashId));

            const updateFn = vm.newFunction('update', function (this: QuickJSHandle, dataHandle: QuickJSHandle) {
                const data = quickJSHandleToHost(vm, dataHandle);
                const hashIdHandle = vm.getProp(this, '_hashId');
                const hashId = quickJSHandleToHost(vm, hashIdHandle);
                const hash = hashObjects[hashId];

                hash?.update(data);
                hashIdHandle.dispose();

                return this;
            });
            vm.setProp(hashObjHandle, 'update', updateFn);
            updateFn.dispose();

            const digestFn = vm.newFunction('digest', function (this: QuickJSHandle, encodingHandle?: QuickJSHandle) {
                const encoding = encodingHandle ? quickJSHandleToHost(vm, encodingHandle) : 'hex';
                const hashIdHandle = vm.getProp(this, '_hashId');
                const hashId = quickJSHandleToHost(vm, hashIdHandle);
                const hash = hashObjects[hashId];
                const result = hash?.digest(encoding);

                delete hashObjects[hashId];
                hashIdHandle.dispose();

                return vm.newString(result as string);
            });
            vm.setProp(hashObjHandle, 'digest', digestFn);
            digestFn.dispose();

            return hashObjHandle;
        });

        vm.setProp(cryptoObjHandle, 'createHash', createHashFn);
        createHashFn.dispose();

        return cryptoObjHandle;
    }

    if (val instanceof Error) {
        const errorObjHandle = vm.newObject();
        vm.setProp(errorObjHandle, 'message', vm.newString(val.message));
        vm.setProp(errorObjHandle, 'name', vm.newString(val.name));
        if (val.stack) {
            vm.setProp(errorObjHandle, 'stack', vm.newString(val.stack));
        }
        return errorObjHandle;
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
            const itemHandle = hostToQuickJSHandle(vm, item, depth + 1);
            vm.setProp(arrHandle, index.toString(), itemHandle);
            itemHandle.dispose();
        });
        return arrHandle;
    } else if (types.isPromise(val)) {
        const promise = vm.newPromise();
        promise.settled.then(vm.runtime.executePendingJobs);
        val.then(
            (r: unknown) => {
                promise.resolve(hostToQuickJSHandle(vm, r, depth + 1));
            },
            (err: unknown) => {
                promise.reject(hostToQuickJSHandle(vm, err, depth + 1));
            }
        );
        return promise.handle;
    } else if (typeof val === 'function') {
        const fnHandle = vm.newFunction(val.name || 'anonymous', (...args: any[]) => {
            const hostArgs = args.map((arg) => quickJSHandleToHost(vm, arg));
            const result = val(...hostArgs);
            return hostToQuickJSHandle(vm, result, depth + 1);
        });
        return fnHandle;
    } else if (types.isNativeError(val)) {
        return vm.newError(val);
    } else if (typeof val === 'object' && !Array.isArray(val)) {
        const objHandle = vm.newObject();

        for (const key in val) {
            if (Object.prototype.hasOwnProperty.call(val, key)) {
                handlePropertyOrMethod(vm, key, val as Record<string, unknown>, objHandle, depth);
            }
        }

        const proto = Object.getPrototypeOf(val);
        for (const key in proto) {
            if (Object.prototype.hasOwnProperty.call(proto, key) && typeof proto[key] === 'function') {
                handlePropertyOrMethod(vm, key, proto, objHandle, depth);
            }
        }

        return objHandle;
    }

    throw new Error(`Unsupported value: ${val}`);
}
