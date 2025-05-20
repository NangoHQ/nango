import { describe, expect, it } from 'vitest';
import { transformToOpenAIFunctions } from './getScriptsConfig.js';
import type { StandardNangoConfig, NangoSyncConfig, NangoModel, NangoModelField } from '@nangohq/types';

describe('transformToOpenAIFunctions', () => {
    it('should transform syncs to OpenAI function format with empty parameters', () => {
        const configs: StandardNangoConfig[] = [
            {
                providerConfigKey: 'google-calendar',
                provider: 'google-calendar',
                syncs: [
                    {
                        name: 'sync-events',
                        description: 'Sync calendar events',
                        returns: ['object'],
                        models: [],
                        endpoints: [],
                        json_schema: {
                            type: 'object',
                            properties: {},
                            required: []
                        }
                    } as NangoSyncConfig
                ],
                actions: [],
                'on-events': []
            }
        ];

        const result = transformToOpenAIFunctions(configs);

        expect(result).toEqual([
            {
                name: 'sync-events',
                description: 'Sync calendar events',
                parameters: {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        ]);
    });

    it('should transform actions to OpenAI function format with parameter descriptions', () => {
        const configs: StandardNangoConfig[] = [
            {
                providerConfigKey: 'google-calendar',
                provider: 'google-calendar',
                syncs: [],
                actions: [
                    {
                        name: 'delete-event',
                        description:
                            'Delete a calendar event with the following parameters:\n- eventId: The ID of the event to delete\n- calendar: Optional calendar ID (defaults to primary calendar)',
                        returns: ['object'],
                        models: [
                            {
                                name: 'DeleteEventInput',
                                fields: [
                                    { name: 'eventId', value: 'string', optional: false } as NangoModelField,
                                    { name: 'calendar', value: 'string', optional: true } as NangoModelField
                                ]
                            } as NangoModel
                        ],
                        input: {
                            name: 'DeleteEventInput',
                            fields: [
                                { name: 'eventId', value: 'string', optional: false } as NangoModelField,
                                { name: 'calendar', value: 'string', optional: true } as NangoModelField
                            ]
                        } as NangoModel,
                        endpoints: [],
                        json_schema: {
                            definitions: {
                                DeleteEventInput: {
                                    type: 'object',
                                    properties: {
                                        eventId: { type: 'string' },
                                        calendar: { type: 'string' }
                                    },
                                    required: ['eventId']
                                }
                            }
                        }
                    } as NangoSyncConfig
                ],
                'on-events': []
            }
        ];

        const result = transformToOpenAIFunctions(configs);

        expect(result).toEqual([
            {
                name: 'delete-event',
                description:
                    'Delete a calendar event with the following parameters:\n- eventId: The ID of the event to delete\n- calendar: Optional calendar ID (defaults to primary calendar)',
                parameters: {
                    type: 'object',
                    properties: {
                        eventId: {
                            type: 'string',
                            description: 'The ID of the event to delete'
                        },
                        calendar: {
                            type: 'string',
                            description: 'Optional calendar ID (defaults to primary calendar)'
                        }
                    },
                    required: ['eventId']
                }
            }
        ]);
    });
});
