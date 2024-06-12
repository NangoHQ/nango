import { expect, describe, it } from 'vitest';
import { ModelsParser } from './modelsParser.js';

describe('parse', () => {
    it('should parse simple object', () => {
        const parser = new ModelsParser({ raw: { Test: { id: 'string' } } });
        parser.parseAll();
        expect(Object.fromEntries(parser.parsed)).toStrictEqual({
            Test: [{ name: 'id', value: 'string', tsType: true }]
        });
    });

    describe('dynamic key', () => {
        it('should handle __string', () => {
            const parser = new ModelsParser({ raw: { Test: { __string: 'string' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: '__string', value: 'string', dynamic: true }]
            });
        });
    });

    describe('inheritance', () => {
        it('should handle __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'TestBase' }, TestBase: { id: 'null' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'id', value: 'null', tsType: true }],
                TestBase: [{ name: 'id', value: 'null', tsType: true }]
            });
        });

        it('should handle nested __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'TestBase' }, TestBase: { __extends: 'TestBase2' }, TestBase2: { id: 'integer' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'id', value: 'integer', tsType: true }],
                TestBase: [{ name: 'id', value: 'integer', tsType: true }],
                TestBase2: [{ name: 'id', value: 'integer', tsType: true }]
            });
        });

        it('should handle and dedup nested __string', () => {
            const parser = new ModelsParser({ raw: { Test: { __string: 'string' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: '__string', value: 'string', dynamic: true }]
            });
        });

        it('should handle missing __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'Unknown' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: []
            });
            expect(parser.errors).toStrictEqual([`Model "Test" is extending "Unknown", but it does not exists`]);
        });

        it('should handle multiple __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'Test1,Test2' }, Test1: { id: 'null' }, Test2: { name: 'null' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [
                    { name: 'id', value: 'null', tsType: true },
                    { name: 'name', value: 'null', tsType: true }
                ],
                Test1: [{ name: 'id', value: 'null', tsType: true }],
                Test2: [{ name: 'name', value: 'null', tsType: true }]
            });
        });
    });

    describe('object literal', () => {
        it('should handle object', () => {
            const parser = new ModelsParser({ raw: { Test: { sub: { id: 'boolean' } } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'sub', value: [{ name: 'id', value: 'boolean', tsType: true }] }]
            });
        });

        it('should handle and dedup __string in object', () => {
            const parser = new ModelsParser({ raw: { Test: { sub: { __string: 'string', __extends: 'TestBase' } }, TestBase: { __string: 'number' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'sub', value: [{ name: '__string', value: 'number', dynamic: true }] }],
                TestBase: [{ name: '__string', value: 'number', dynamic: true }]
            });
        });
    });

    describe('string literal', () => {
        it('should handle string literal', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'literal' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'user', value: 'literal' }]
            });
        });
    });

    describe('array literal', () => {
        it('should handle array literal', () => {
            const parser = new ModelsParser({ raw: { Test: { user: ['foo', 'bar'] } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [
                    {
                        name: 'user',
                        value: [
                            { name: '0', value: 'foo' },
                            { name: '1', value: 'bar' }
                        ]
                    }
                ]
            });
        });

        it('should handle array with Model and ts type', () => {
            const parser = new ModelsParser({ raw: { Test: { user: ['string', 'User'] }, User: { id: 'string' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [
                    {
                        name: 'user',
                        value: [
                            { name: '0', value: 'string', tsType: true },
                            { name: '1', value: 'User', model: true }
                        ]
                    }
                ],
                User: [{ name: 'id', value: 'string', tsType: true }]
            });
        });
    });

    describe('Model', () => {
        it('should handle Model', () => {
            const parser = new ModelsParser({ raw: { User: { id: 'string' }, Test: { user: 'User' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                User: [{ name: 'id', value: 'string', tsType: true }],
                Test: [{ name: 'user', value: 'User', model: true }]
            });
            expect(parser.warnings).toStrictEqual([]);
        });

        it('should handle Model out of order', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'User' }, User: { id: 'string' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'user', value: 'User', model: true }],
                User: [{ name: 'id', value: 'string', tsType: true }]
            });
        });

        it('should handle missing Model', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'User' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'user', value: 'User' }]
            });
            expect(parser.warnings).toStrictEqual([`Model "User" is not defined, using as string literal`]);
        });

        it('should handle cyclic Model', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'Test' } } });
            parser.parseAll();

            expect(parser.warnings).toStrictEqual([`Cyclic import Test->Test`]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'user', value: 'Test', model: true }]
            });
        });

        it('should handle cyclic through object', () => {
            const parser = new ModelsParser({ raw: { Test: { user: { author: 'Test' } } } });
            parser.parseAll();

            expect(parser.warnings).toStrictEqual([`Cyclic import Test->Test`]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'user', value: [{ name: 'author', value: 'Test', model: true }] }]
            });
        });

        it('should handle cyclic through array', () => {
            const parser = new ModelsParser({ raw: { Test: { user: ['Test'] } } });
            parser.parseAll();

            expect(parser.warnings).toStrictEqual([`Cyclic import Test->Test`]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: [{ name: 'user', value: [{ name: '0', value: 'Test', model: true }] }]
            });
        });
    });
});
