import { describe, expect, it } from 'vitest';

import { httpSnippet, nodeActionSnippet, nodeSyncSnippet } from './language-snippets';

import type { NangoSyncEndpointV2 } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

describe('language snippets', () => {
    const sampleInput: JSONSchema7 = {
        type: 'object',
        required: ['aString', 'aNumber', 'aBoolean', 'anArrayOfStrings', 'anObject', 'anArrayOfObjects', 'anArrayOfReferencedModel', 'aUnion'],
        properties: {
            aString: {
                type: 'string'
            },
            aNumber: {
                type: 'number'
            },
            aBoolean: {
                type: 'boolean'
            },
            anArrayOfStrings: {
                type: 'array',
                items: {
                    type: 'string'
                }
            },
            anObject: {
                type: 'object',
                required: ['anotherString'],
                properties: {
                    anotherString: {
                        type: 'string'
                    }
                }
            },
            anArrayOfObjects: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['anotherString'],
                    properties: {
                        anotherString: {
                            type: 'string'
                        }
                    }
                }
            },
            anArrayOfReferencedModel: {
                type: 'array',
                items: {
                    $ref: '#/definitions/Address'
                }
            },
            aUnion: {
                type: ['string', 'number']
            }
        }
    };

    describe('nodeSyncSnippet', () => {
        it('should match snapshot', () => {
            const snippet = nodeSyncSnippet({
                modelName: 'users',
                secretKey: 'secret',
                connectionId: 'connectionId',
                providerConfigKey: 'providerConfigKey'
            });

            expect(snippet).toMatchSnapshot();
        });
    });

    describe('nodeActionSnippet', () => {
        it('should match snapshot', () => {
            const snippet = nodeActionSnippet({
                actionName: 'createUser',
                secretKey: 'secret',
                connectionId: 'connectionId',
                providerConfigKey: 'providerConfigKey',
                input: sampleInput
            });

            expect(snippet).toMatchSnapshot();
        });
    });

    describe('httpSnippet', () => {
        const baseTestData = {
            baseUrl: 'https://api.nango.dev',
            secretKey: 'nango_secret_key_123456789',
            connectionId: 'test_connection_id',
            providerConfigKey: 'github'
        };

        describe('GET endpoint', () => {
            const getEndpoint: NangoSyncEndpointV2 = {
                method: 'GET',
                path: '/users'
            };

            it('should generate cURL snippet', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: getEndpoint,
                    language: 'shell'
                });

                expect(snippet).toMatchSnapshot();
            });

            it('should generate Java snippet', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: getEndpoint,
                    language: 'java'
                });

                expect(snippet).toMatchSnapshot();
            });

            it('should generate Python snippet', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: getEndpoint,
                    language: 'python'
                });

                expect(snippet).toMatchSnapshot();
            });

            it('should generate Go snippet', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: getEndpoint,
                    language: 'go'
                });

                expect(snippet).toMatchSnapshot();
            });

            it('should generate PHP snippet', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: getEndpoint,
                    language: 'php'
                });

                expect(snippet).toMatchSnapshot();
            });
        });

        describe('POST endpoint with input', () => {
            const postEndpoint: NangoSyncEndpointV2 = {
                method: 'POST',
                path: '/users'
            };

            it('should generate cURL snippet with input', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: postEndpoint,
                    language: 'shell',
                    input: sampleInput
                });

                expect(snippet).toMatchSnapshot();
            });

            it('should generate Java snippet with input', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: postEndpoint,
                    language: 'java',
                    input: sampleInput
                });

                expect(snippet).toMatchSnapshot();
            });

            it('should generate Python snippet with input', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: postEndpoint,
                    language: 'python',
                    input: sampleInput
                });

                expect(snippet).toMatchSnapshot();
            });

            it('should generate Go snippet with input', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: postEndpoint,
                    language: 'go',
                    input: sampleInput
                });

                expect(snippet).toMatchSnapshot();
            });

            it('should generate PHP snippet with input', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: postEndpoint,
                    language: 'php',
                    input: sampleInput
                });

                expect(snippet).toMatchSnapshot();
            });
        });

        describe('with hideSecret option', () => {
            const getEndpoint: NangoSyncEndpointV2 = {
                method: 'GET',
                path: '/users'
            };

            it('should generate cURL snippet with hidden secret', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: getEndpoint,
                    language: 'shell',
                    hideSecret: true
                });

                expect(snippet).toMatchSnapshot();
            });

            it('should generate cURL snippet with visible secret', async () => {
                const snippet = await httpSnippet({
                    ...baseTestData,
                    endpoint: getEndpoint,
                    language: 'shell',
                    hideSecret: false
                });

                expect(snippet).toMatchSnapshot();
            });
        });
    });
});
