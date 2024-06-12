import { expect, describe, it } from 'vitest';
import { ModelsParser } from './modelsParser.js';
import { ParserError } from './errors.js';

describe('parse', () => {
    it('should parse simple object', () => {
        const parser = new ModelsParser({ raw: { Test: { id: 'string' } } });
        parser.parseAll();
        expect(Object.fromEntries(parser.parsed)).toStrictEqual({
            Test: { name: 'Test', fields: [{ name: 'id', value: 'string', tsType: true, array: false }] }
        });
    });

    describe('dynamic key', () => {
        it('should handle __string', () => {
            const parser = new ModelsParser({ raw: { Test: { __string: 'string' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: '__string', value: 'string', dynamic: true }] }
            });
        });
    });

    describe('inheritance', () => {
        it('should handle __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'TestBase' }, TestBase: { id: '1' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'id', value: 1, tsType: true, array: false }] },
                TestBase: { name: 'TestBase', fields: [{ name: 'id', value: 1, tsType: true, array: false }] }
            });
        });

        it('should handle nested __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'TestBase' }, TestBase: { __extends: 'TestBase2' }, TestBase2: { id: 'integer' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'id', value: 'number', tsType: true, array: false }] },
                TestBase: { name: 'TestBase', fields: [{ name: 'id', value: 'number', tsType: true, array: false }] },
                TestBase2: { name: 'TestBase2', fields: [{ name: 'id', value: 'number', tsType: true, array: false }] }
            });
        });

        it('should handle and dedup nested __string', () => {
            const parser = new ModelsParser({ raw: { Test: { __string: 'string' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: '__string', value: 'string', dynamic: true }] }
            });
        });

        it('should handle missing __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'Unknown' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [] }
            });
            expect(parser.errors).toStrictEqual([
                new ParserError({
                    code: 'model_extends_not_found',
                    message: `Model "Test" is extending "Unknown", but it does not exists`,
                    path: ['Test', '__extends']
                })
            ]);
        });

        it('should handle multiple __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'Test1,Test2' }, Test1: { id: 'null' }, Test2: { name: 'null' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [
                        { name: 'id', value: null, tsType: true, array: false },
                        { name: 'name', value: null, tsType: true, array: false }
                    ]
                },
                Test1: { name: 'Test1', fields: [{ name: 'id', value: null, tsType: true, array: false }] },
                Test2: { name: 'Test2', fields: [{ name: 'name', value: null, tsType: true, array: false }] }
            });
        });
    });

    describe('object literal', () => {
        it('should handle object', () => {
            const parser = new ModelsParser({ raw: { Test: { sub: { id: 'boolean' } } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'sub', value: [{ name: 'id', value: 'boolean', tsType: true, array: false }] }] }
            });
        });

        it('should handle and dedup __string in object', () => {
            const parser = new ModelsParser({ raw: { Test: { sub: { __string: 'string', __extends: 'TestBase' } }, TestBase: { __string: 'number' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'sub', value: [{ name: '__string', value: 'number', dynamic: true }] }] },
                TestBase: { name: 'TestBase', fields: [{ name: '__string', value: 'number', dynamic: true }] }
            });
        });
    });

    describe('string literal', () => {
        it('should handle string literal', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'literal' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'literal', array: false }] }
            });
        });
    });

    describe('array literal', () => {
        it('should handle array literal', () => {
            const parser = new ModelsParser({ raw: { Test: { user: ['foo', 'bar'] } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [
                        {
                            name: 'user',
                            array: true,
                            value: [
                                { name: '0', value: 'foo', array: false },
                                { name: '1', value: 'bar', array: false }
                            ]
                        }
                    ]
                }
            });
        });

        it('should handle array with Model and ts type', () => {
            const parser = new ModelsParser({ raw: { Test: { user: ['string', 'User'] }, User: { id: 'string' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [
                        {
                            name: 'user',
                            array: true,
                            value: [
                                { name: '0', value: 'string', tsType: true, array: false },
                                { name: '1', value: 'User', model: true }
                            ]
                        }
                    ]
                },
                User: { name: 'User', fields: [{ name: 'id', value: 'string', tsType: true, array: false }] }
            });
        });
    });

    describe('union', () => {
        it('should handle union literal', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'literal1 | literal2' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [
                        {
                            name: 'user',
                            value: [
                                { name: '0', value: 'literal1', array: false },
                                { name: '1', value: 'literal2', array: false }
                            ],
                            union: true
                        }
                    ]
                }
            });
        });

        it('should handle union with Model, ts types and data types', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'true | literal | GithubIssue | boolean[]' }, GithubIssue: { id: 'string' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                GithubIssue: { name: 'GithubIssue', fields: [{ name: 'id', value: 'string', tsType: true, array: false }] },
                Test: {
                    name: 'Test',
                    fields: [
                        {
                            name: 'user',
                            value: [
                                { name: '0', value: true, tsType: true, array: false },
                                { name: '1', value: 'literal', array: false },
                                { name: '2', value: 'GithubIssue', model: true },
                                { name: '3', value: 'boolean', tsType: true, array: true }
                            ],
                            union: true
                        }
                    ]
                }
            });
        });
    });

    describe('exotic data type', () => {
        it('should handle Date', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'Date' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'Date', tsType: true, array: false }] }
            });
        });
    });

    describe('typescript arrays', () => {
        it('should handle Date', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'true[]' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: true, tsType: true, array: true }] }
            });
        });
    });

    describe('Model', () => {
        it('should handle Model', () => {
            const parser = new ModelsParser({ raw: { User: { id: 'string' }, Test: { user: 'User' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                User: { name: 'User', fields: [{ name: 'id', value: 'string', tsType: true, array: false }] },
                Test: { name: 'Test', fields: [{ name: 'user', value: 'User', model: true }] }
            });
            expect(parser.warnings).toStrictEqual([]);
        });

        it('should handle Model out of order', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'User' }, User: { id: 'string' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'User', model: true }] },
                User: { name: 'User', fields: [{ name: 'id', value: 'string', tsType: true, array: false }] }
            });
        });

        it('should handle missing Model', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'User' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'User', array: false }] }
            });
            expect(parser.warnings).toStrictEqual([
                new ParserError({ code: 'model_not_found', message: `Model "User" is not defined, using as string literal`, path: ['Test', 'User'] })
            ]);
        });

        it('should handle cyclic Model', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'Test' } } });
            parser.parseAll();

            expect(parser.warnings).toStrictEqual([new ParserError({ code: 'cyclic', message: `Cyclic import Test->Test`, path: ['Test', 'Test'] })]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'Test', model: true }] }
            });
        });

        it('should handle cyclic through object', () => {
            const parser = new ModelsParser({ raw: { Test: { user: { author: 'Test' } } } });
            parser.parseAll();

            expect(parser.warnings).toStrictEqual([new ParserError({ code: 'cyclic', message: `Cyclic import Test->Test`, path: ['Test', 'Test'] })]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: [{ name: 'author', value: 'Test', model: true }] }] }
            });
        });

        it('should handle cyclic through array', () => {
            const parser = new ModelsParser({ raw: { Test: { user: ['Test'] } } });
            parser.parseAll();

            expect(parser.warnings).toStrictEqual([new ParserError({ code: 'cyclic', message: `Cyclic import Test->Test`, path: ['Test', 'Test'] })]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', array: true, value: [{ name: '0', value: 'Test', model: true }] }] }
            });
        });
    });
});
