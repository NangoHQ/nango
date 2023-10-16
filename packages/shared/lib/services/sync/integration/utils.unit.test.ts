import { expect, describe, it, vi } from 'vitest';
import * as IntegrationUtils from './utils.js';

const logSpy = vi.spyOn(console, 'log');

describe('hostConsoleLog', () => {
    it('should log the provided arguments', () => {
        IntegrationUtils.hostConsoleLog('test', 123);
        expect(logSpy).toHaveBeenCalledWith('test', 123);
    });
});

describe('isClassInstance', () => {
    it('should return true for class instances', () => {
        class TestClass {}
        const instance = new TestClass();
        expect(IntegrationUtils.isClassInstance(instance)).toBe(true);
    });

    it('should return false for plain objects', () => {
        const obj = {};
        expect(IntegrationUtils.isClassInstance(obj)).toBe(false);
    });
});

describe('classToObject', () => {
    it('should convert class instance to object', () => {
        class TestClass {
            prop = 'value';
            method() {
                return 'methodValue';
            }
        }
        const instance = new TestClass();
        const obj: any = IntegrationUtils.classToObject(instance);
        expect(obj).toHaveProperty('prop', 'value');
        expect(obj['method']()).toBe('methodValue');
    });

    it('should convert class instance to object of an object that extends another', () => {
        class BaseClass {
            otherProp = 'someValue';
            someDate = new Date('2021-01-01');

            otherMethod() {
                return 'otherMethodValue';
            }
        }
        class TestClass extends BaseClass {
            prop = 'value';
            someOtherDate = new Date('2021-01-01');
            method() {
                return 'methodValue';
            }
        }
        const instance = new TestClass();
        const obj: any = IntegrationUtils.classToObject(instance);
        expect(obj).toHaveProperty('prop', 'value');
        expect(obj['method']()).toBe('methodValue');
        expect(obj.someDate.toISOString()).toBe('2021-01-01T00:00:00.000Z');
        expect(obj).toHaveProperty('otherProp', 'someValue');
        expect(obj['otherMethod']()).toBe('otherMethodValue');
        expect(obj.someOtherDate.toISOString()).toBe('2021-01-01T00:00:00.000Z');
    });

    it('should return the same object if not a class instance', () => {
        const obj = { key: 'value' };
        expect(IntegrationUtils.classToObject(obj)).toBe(obj);
    });
});
