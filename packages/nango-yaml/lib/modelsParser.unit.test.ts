import { expect, describe, it } from 'vitest';
import { ModelsParser } from './modelsParser.js';
import { ParserError, ParserErrorCycle, ParserErrorDataSyntax, ParserErrorExtendsNotFound, ParserErrorInvalidModelName } from './errors.js';

describe('parse', () => {
    it('should parse simple object', () => {
        const parser = new ModelsParser({ raw: { Test: { id: 'string' } } });
        parser.parseAll();
        expect(Object.fromEntries(parser.parsed)).toStrictEqual({
            Test: { name: 'Test', fields: [{ name: 'id', value: 'string', tsType: true, array: false, optional: false }] }
        });
    });

    describe('dynamic key', () => {
        it('should handle __string', () => {
            const parser = new ModelsParser({ raw: { Test: { __string: 'string' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: '__string', value: 'string', dynamic: true, optional: false }] }
            });
        });
    });

    describe('inheritance', () => {
        it('should handle __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'TestBase' }, TestBase: { id: '1' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'id', value: 1, tsType: true, array: false, optional: false }] },
                TestBase: { name: 'TestBase', fields: [{ name: 'id', value: 1, tsType: true, array: false, optional: false }] }
            });
        });

        it('should handle nested __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'TestBase' }, TestBase: { __extends: 'TestBase2' }, TestBase2: { id: 'integer' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'id', value: 'number', tsType: true, array: false, optional: false }] },
                TestBase: { name: 'TestBase', fields: [{ name: 'id', value: 'number', tsType: true, array: false, optional: false }] },
                TestBase2: { name: 'TestBase2', fields: [{ name: 'id', value: 'number', tsType: true, array: false, optional: false }] }
            });
        });

        it('should handle and dedup nested __string', () => {
            const parser = new ModelsParser({ raw: { Test: { __string: 'string' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: '__string', value: 'string', dynamic: true, optional: false }] }
            });
        });

        it('should handle missing __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'Unknown' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [] }
            });
            expect(parser.errors).toStrictEqual([new ParserErrorExtendsNotFound({ model: 'Test', inherit: 'Unknown', path: ['Test', '__extends'] })]);
        });

        it('should handle multiple __extends', () => {
            const parser = new ModelsParser({ raw: { Test: { __extends: 'Test1,Test2' }, Test1: { id: 'null' }, Test2: { name: 'null' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [
                        { name: 'id', value: null, tsType: true, array: false, optional: false },
                        { name: 'name', value: null, tsType: true, array: false, optional: false }
                    ]
                },
                Test1: { name: 'Test1', fields: [{ name: 'id', value: null, tsType: true, array: false, optional: false }] },
                Test2: { name: 'Test2', fields: [{ name: 'name', value: null, tsType: true, array: false, optional: false }] }
            });
        });
    });

    describe('object literal', () => {
        it('should handle yaml object', () => {
            const parser = new ModelsParser({ raw: { Test: { sub: { id: 'boolean' } } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [{ name: 'sub', optional: false, value: [{ name: 'id', value: 'boolean', tsType: true, array: false, optional: false }] }]
                }
            });
        });

        it('should handle and dedup __string in object', () => {
            const parser = new ModelsParser({ raw: { Test: { sub: { __string: 'string', __extends: 'TestBase' } }, TestBase: { __string: 'number' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [{ name: 'sub', optional: false, value: [{ name: '__string', value: 'number', dynamic: true, optional: false }] }]
                },
                TestBase: { name: 'TestBase', fields: [{ name: '__string', value: 'number', dynamic: true, optional: false }] }
            });
        });

        it('should handle literal object name', () => {
            const parser = new ModelsParser({ raw: { Test: { sub: 'object' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [{ name: 'sub', optional: false, tsType: true, value: 'object', array: false }]
                }
            });
        });
    });

    describe('string literal', () => {
        it('should handle string literal', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'literal' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'literal', array: false, optional: false }] }
            });
        });
    });

    describe('array literal', () => {
        it('should handle array', () => {
            const parser = new ModelsParser({ raw: { Test: { user: ['foo', 'bar'] } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [
                        {
                            name: 'user',
                            optional: false,
                            array: true,
                            value: [
                                { name: '0', value: 'foo', array: false, optional: false },
                                { name: '1', value: 'bar', array: false, optional: false }
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
                            optional: false,
                            array: true,
                            value: [
                                { name: '0', value: 'string', tsType: true, array: false, optional: false },
                                { name: '1', value: 'User', model: true, optional: false }
                            ]
                        }
                    ]
                },
                User: { name: 'User', fields: [{ name: 'id', value: 'string', tsType: true, array: false, optional: false }] }
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
                            optional: false,
                            value: [
                                { name: '0', value: 'literal1', array: false, optional: false },
                                { name: '1', value: 'literal2', array: false, optional: false }
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
                GithubIssue: { name: 'GithubIssue', fields: [{ name: 'id', value: 'string', tsType: true, array: false, optional: false }] },
                Test: {
                    name: 'Test',
                    fields: [
                        {
                            name: 'user',
                            optional: false,
                            value: [
                                { name: '0', value: true, tsType: true, array: false, optional: false },
                                { name: '1', value: 'literal', array: false, optional: false },
                                { name: '2', value: 'GithubIssue', model: true, optional: false },
                                { name: '3', value: 'boolean', tsType: true, array: true, optional: false }
                            ],
                            union: true
                        }
                    ]
                }
            });
        });
    });

    describe('optional type', () => {
        it('should handle optional type', () => {
            const parser = new ModelsParser({ raw: { Test: { 'user?': 'string' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [{ name: 'user', value: 'string', tsType: true, array: false, optional: true }]
                }
            });
        });
        it('should not confuse ? when not at the end', () => {
            const parser = new ModelsParser({ raw: { Test: { 'use?r': 'string' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [{ name: 'use?r', value: 'string', tsType: true, array: false, optional: false }]
                }
            });
        });
    });

    describe('exotic model name', () => {
        it.each(['è!à"', '<>', ':=ù'])('should handle exotic model name', (val) => {
            const parser = new ModelsParser({ raw: { [val]: { user: 'string' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([new ParserErrorInvalidModelName({ model: val, path: [val] })]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({});
        });
    });

    describe('exotic data type', () => {
        it.each(['date', 'Date'])('should handle Date', (val) => {
            const parser = new ModelsParser({ raw: { Test: { user: val } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'Date', tsType: true, array: false, optional: false }] }
            });
        });

        it.each(['Pick<', 'Omit<', 'Array<', 'Readonly<'])('should refuse typescript advanced feature', (val) => {
            const parser = new ModelsParser({ raw: { Test: { user: val } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(parser.warnings).toStrictEqual([new ParserErrorDataSyntax({ value: val, path: ['Test', 'user'] })]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: val, array: false, optional: false }] }
            });
        });
    });

    describe('typescript arrays', () => {
        it('should handle arrays', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'true[]' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: true, tsType: true, array: true, optional: false }] }
            });
        });

        it('should handle array type', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'array' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [{ name: 'user', tsType: true, value: 'any[]', optional: false, array: false }]
                }
            });
        });
    });

    describe('typescript any', () => {
        it('should handle any', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'any[]' } } });
            parser.parseAll();

            expect(parser.errors).toStrictEqual([]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'any', tsType: true, array: true, optional: false }] }
            });
        });
    });

    describe('Model', () => {
        it('should handle Model', () => {
            const parser = new ModelsParser({ raw: { User: { id: 'string' }, Test: { user: 'User' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                User: { name: 'User', fields: [{ name: 'id', value: 'string', tsType: true, array: false, optional: false }] },
                Test: { name: 'Test', fields: [{ name: 'user', value: 'User', model: true, optional: false }] }
            });
            expect(parser.warnings).toStrictEqual([]);
        });

        it('should handle Model out of order', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'User' }, User: { id: 'string' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'User', model: true, optional: false }] },
                User: { name: 'User', fields: [{ name: 'id', value: 'string', tsType: true, array: false, optional: false }] }
            });
        });

        it('should handle missing Model', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'User' } } });
            parser.parseAll();

            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'User', array: false, optional: false }] }
            });
            expect(parser.warnings).toStrictEqual([
                new ParserError({ code: 'model_not_found_fallback', message: `Model "User" is not defined, using as string literal`, path: ['Test', 'User'] })
            ]);
        });

        it('should handle cyclic Model', () => {
            const parser = new ModelsParser({ raw: { Test: { user: 'Test' } } });
            parser.parseAll();

            expect(parser.warnings).toStrictEqual([new ParserErrorCycle({ name: 'Test' })]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', value: 'Test', model: true, optional: false }] }
            });
        });

        it('should handle cyclic through object', () => {
            const parser = new ModelsParser({ raw: { Test: { user: { author: 'Test' } } } });
            parser.parseAll();

            expect(parser.warnings).toStrictEqual([new ParserErrorCycle({ name: 'Test' })]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: { name: 'Test', fields: [{ name: 'user', optional: false, value: [{ name: 'author', value: 'Test', model: true, optional: false }] }] }
            });
        });

        it('should handle cyclic through array', () => {
            const parser = new ModelsParser({ raw: { Test: { user: ['Test'] } } });
            parser.parseAll();

            expect(parser.warnings).toStrictEqual([new ParserErrorCycle({ name: 'Test' })]);
            expect(Object.fromEntries(parser.parsed)).toStrictEqual({
                Test: {
                    name: 'Test',
                    fields: [{ name: 'user', optional: false, array: true, value: [{ name: '0', value: 'Test', model: true, optional: false }] }]
                }
            });
        });
    });
});
