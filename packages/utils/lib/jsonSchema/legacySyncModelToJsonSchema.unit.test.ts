import { describe, expect, it } from 'vitest';

import { legacySyncModelsToJsonSchema } from './legacySyncModelToJsonSchema.js';

import type { LegacySyncModelSchema } from '@nangohq/types';

describe('legacySyncModelsToJsonSchema', () => {
    it('should handle all primitive types and basic features', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'AllPrimitiveTypes',
                fields: [
                    { name: 'stringField', type: 'string' },
                    { name: 'charField', type: 'char' },
                    { name: 'varcharField', type: 'varchar' },
                    { name: 'numberField', type: 'number' },
                    { name: 'floatField', type: 'float' },
                    { name: 'intField', type: 'int' },
                    { name: 'integerField', type: 'integer' },
                    { name: 'booleanField', type: 'boolean' },
                    { name: 'boolField', type: 'bool' },
                    { name: 'trueField', type: 'true' },
                    { name: 'falseField', type: 'false' },
                    { name: 'dateField', type: 'date' },
                    { name: 'undefinedField', type: 'undefined' },
                    { name: 'nullField', type: 'null' },
                    { name: 'anyField', type: 'any' },
                    { name: 'objectField', type: 'object' },
                    { name: 'arrayField', type: 'array' },
                    { name: 'optionalString', type: 'string | undefined' },
                    { name: 'unknownType', type: 'uuid' }, // Should default to string
                    { name: 'stringArray', type: 'string[]' },
                    { name: 'numberArray', type: 'number[] | undefined' },
                    { name: 'literalUnion', type: 'red | blue' }
                ]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle references to other models', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'User',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'profile', type: 'Profile' },
                    { name: 'roles', type: 'Role[]' }
                ]
            },
            {
                name: 'Profile',
                fields: [
                    { name: 'bio', type: 'string' },
                    { name: 'avatar', type: 'string | null' }
                ]
            },
            {
                name: 'Role',
                fields: [{ name: 'name', type: 'string' }]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle unions and optionals', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'Event',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'status', type: 'active | canceled' },
                    { name: 'maybeString', type: 'string | null | undefined' },
                    { name: 'maybeModel', type: 'Profile | null' }
                ]
            },
            {
                name: 'Profile',
                fields: [{ name: 'bio', type: 'string' }]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle optionals from name', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'Model',
                fields: [
                    { name: 'requiredString', type: 'string' },
                    { name: 'requiredNumber', type: 'number' },
                    { name: 'optionalString?', type: 'string' },
                    { name: 'optionalNumber?', type: 'number' }
                ]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle arrays of models and primitives', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'Document',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'tags', type: 'string[]' },
                    { name: 'collaborators', type: 'User[] | undefined' }
                ]
            },
            {
                name: 'User',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'email', type: 'string' }
                ]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle empty models array', () => {
        const models: LegacySyncModelSchema[] = [];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle model with no fields', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'EmptyModel',
                fields: []
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should not reference a non-existent model', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'HasMissingRef',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'missing', type: 'NonExistentModel' }
                ]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle inline objects', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'InlineObject',
                fields: [
                    { name: 'string', type: 'string' },
                    { name: 'object', type: { string: 'string', number: 'number' } }
                ]
            } as LegacySyncModelSchema
        ];

        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle nested fields separated by dots', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'NestedFields',
                fields: [
                    { name: 'string', type: 'string' },
                    { name: 'nested.string', type: 'string' },
                    { name: 'nested.number', type: 'number' },
                    { name: 'nested.object.string', type: 'string' },
                    { name: 'nested.object.number', type: 'number' },
                    {
                        name: 'nested.object.inlineObject',
                        type: {
                            string: 'string',
                            number: 'number'
                        }
                    }
                ]
            } as LegacySyncModelSchema
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    describe('real-world examples', () => {
        it('GoogleCalendarEvent', () => {
            const models: LegacySyncModelSchema[] = [
                {
                    name: 'GoogleCalendarEvent',
                    fields: [
                        // Reduced to special cases
                        {
                            name: 'creator.id',
                            type: 'string'
                        },
                        {
                            name: 'creator.email',
                            type: 'string'
                        },
                        {
                            name: 'creator.displayName',
                            type: 'string'
                        },
                        {
                            name: 'creator.self',
                            type: 'boolean'
                        },
                        {
                            name: 'organizer.id',
                            type: 'string'
                        },
                        {
                            name: 'organizer.email',
                            type: 'string'
                        },
                        {
                            name: 'organizer.displayName',
                            type: 'string'
                        },
                        {
                            name: 'organizer.self',
                            type: 'boolean'
                        },
                        {
                            name: 'start.date',
                            type: 'date'
                        },
                        {
                            name: 'start.dateTime',
                            type: 'string'
                        },
                        {
                            name: 'start.timeZone',
                            type: 'string'
                        },
                        {
                            name: 'end.date',
                            type: 'date'
                        },
                        {
                            name: 'end.string',
                            type: 'string'
                        },
                        {
                            name: 'end.timeZone',
                            type: 'string'
                        },
                        {
                            name: 'endTimeUnspecified',
                            type: 'boolean'
                        },
                        {
                            name: 'recurrence.0',
                            type: 'string'
                        },
                        {
                            name: 'recurringEventId',
                            type: 'string'
                        },
                        {
                            name: 'originalStartTime.date',
                            type: 'date'
                        },
                        {
                            name: 'originalStartTime.dateTime',
                            type: 'string'
                        },
                        {
                            name: 'originalStartTime.timeZone',
                            type: 'string'
                        },
                        {
                            name: 'attendees.0',
                            type: {
                                id: 'string',
                                self: 'boolean',
                                email: 'string',
                                comment: 'string',
                                optional: 'boolean',
                                resource: 'boolean',
                                organizer: 'boolean',
                                displayName: 'string',
                                responseStatus: 'string',
                                additionalGuests: 'integer'
                            }
                        },
                        {
                            name: 'extendedProperties.private',
                            type: {
                                key: 'string'
                            }
                        },
                        {
                            name: 'extendedProperties.shared',
                            type: {
                                key: 'string'
                            }
                        },
                        {
                            name: 'conferenceData.createRequest',
                            type: {
                                status: {
                                    statusCode: 'string'
                                },
                                requestId: 'string',
                                conferenceSolutionKey: {
                                    type: 'string'
                                }
                            }
                        },
                        {
                            name: 'conferenceData.entryPoints',
                            type: [
                                {
                                    pin: 'string',
                                    uri: 'string',
                                    label: 'string',
                                    passcode: 'string',
                                    password: 'string',
                                    accessCode: 'string',
                                    meetingCode: 'string',
                                    entryPointType: 'string'
                                }
                            ]
                        },
                        {
                            name: 'conferenceData.conferenceSolution',
                            type: {
                                key: {
                                    type: 'string'
                                },
                                name: 'string',
                                iconUri: 'string'
                            }
                        },

                        {
                            name: 'gadget.preferences',
                            type: {
                                key: 'string'
                            }
                        },
                        {
                            name: 'reminders.overrides',
                            type: [
                                {
                                    method: 'string',
                                    minutes: 'integer'
                                }
                            ]
                        },
                        {
                            name: 'source.url',
                            type: 'string'
                        },
                        {
                            name: 'source.title',
                            type: 'string'
                        },
                        {
                            name: 'workingLocationProperties.type',
                            type: 'string'
                        },
                        {
                            name: 'workingLocationProperties.homeOffice',
                            type: 'string'
                        },
                        {
                            name: 'workingLocationProperties.customLocation',
                            type: {
                                label: 'string'
                            }
                        },
                        {
                            name: 'workingLocationProperties.officeLocation',
                            type: {
                                label: 'string',
                                deskId: 'string',
                                floorId: 'string',
                                buildingId: 'string',
                                floorSectionId: 'string'
                            }
                        },
                        {
                            name: 'attachments.0',
                            type: {
                                title: 'string',
                                fileId: 'string',
                                fileUrl: 'string',
                                iconLink: 'string',
                                mimeType: 'string'
                            }
                        },
                        {
                            name: 'eventType',
                            type: 'string'
                        }
                    ]
                } as LegacySyncModelSchema
            ];

            const result = legacySyncModelsToJsonSchema(models);
            expect(result).toMatchSnapshot();
        });

        it('Empty array type', () => {
            // This is invalid according to our type definition, but we found it in the wild.
            const models: LegacySyncModelSchema[] = [
                {
                    name: 'EmptyArrayType',
                    fields: [{ name: 'array', type: [] } as unknown]
                }
            ] as LegacySyncModelSchema[];

            const result = legacySyncModelsToJsonSchema(models);
            expect(result).toMatchSnapshot();
        });
    });
});
