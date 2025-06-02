import { describe, expect, it } from 'vitest';

import { getDefinition, getDefinitionsRecursively } from './json-schema.js';

import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';

describe('getDefinition', () => {
    it('should return the definition when it exists', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' }
                    }
                }
            }
        };

        const result = getDefinition('User', rootSchema);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toEqual({
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                }
            });
        }
    });

    it('should return an error when definition does not exist', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' }
                    }
                }
            }
        };

        const result = getDefinition('NonExistent', rootSchema);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('json_schema doesn\'t contain model "NonExistent"');
        }
    });

    it('should return an error when definitions object is undefined', () => {
        const rootSchema: JSONSchema7 = {};

        const result = getDefinition('User', rootSchema);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('json_schema doesn\'t contain model "User"');
        }
    });

    it('should return an error when definitions object is empty', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {}
        };

        const result = getDefinition('User', rootSchema);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('json_schema doesn\'t contain model "User"');
        }
    });

    it('should return an error when the definition is a boolean', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                AlwaysValid: true,
                AlwaysInvalid: false
            }
        };

        const validResult = getDefinition('AlwaysValid', rootSchema);
        const invalidResult = getDefinition('AlwaysInvalid', rootSchema);

        expect(validResult.isErr()).toBe(true);
        expect(invalidResult.isErr()).toBe(true);
        if (validResult.isErr()) {
            expect(validResult.error.message).toBe('json_schema doesn\'t contain model "AlwaysValid"');
        }
        if (invalidResult.isErr()) {
            expect(invalidResult.error.message).toBe('json_schema doesn\'t contain model "AlwaysInvalid"');
        }
    });
});

describe('getDefinitionsRecursively', () => {
    it('should return single definition with no references', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' }
                    }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('User', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value)).toEqual(['User']);
            expect(result.value['User']).toEqual({
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    name: { type: 'string' }
                }
            });
        }
    });

    it('should return definition with direct reference', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        profile: { $ref: '#/definitions/Profile' }
                    }
                },
                Profile: {
                    type: 'object',
                    properties: {
                        bio: { type: 'string' },
                        avatar: { type: 'string' }
                    }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('User', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value).sort()).toEqual(['Profile', 'User']);
            expect(result.value['User']).toEqual({
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    profile: { $ref: '#/definitions/Profile' }
                }
            });
            expect(result.value['Profile']).toEqual({
                type: 'object',
                properties: {
                    bio: { type: 'string' },
                    avatar: { type: 'string' }
                }
            });
        }
    });

    it('should handle nested references', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        profile: { $ref: '#/definitions/Profile' }
                    }
                },
                Profile: {
                    type: 'object',
                    properties: {
                        bio: { type: 'string' },
                        address: { $ref: '#/definitions/Address' }
                    }
                },
                Address: {
                    type: 'object',
                    properties: {
                        street: { type: 'string' },
                        city: { type: 'string' }
                    }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('User', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value).sort()).toEqual(['Address', 'Profile', 'User']);
        }
    });

    it('should handle array items with references', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                UserList: {
                    type: 'array',
                    items: { $ref: '#/definitions/User' }
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' }
                    }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('UserList', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value).sort()).toEqual(['User', 'UserList']);
        }
    });

    it('should handle array items as array with references', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                Mixed: {
                    type: 'array',
                    items: [{ $ref: '#/definitions/User' }, { $ref: '#/definitions/Profile' }]
                },
                User: {
                    type: 'object',
                    properties: { id: { type: 'string' } }
                },
                Profile: {
                    type: 'object',
                    properties: { bio: { type: 'string' } }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('Mixed', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value).sort()).toEqual(['Mixed', 'Profile', 'User']);
        }
    });

    it('should handle oneOf, anyOf, allOf references', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                Entity: {
                    oneOf: [{ $ref: '#/definitions/User' }, { $ref: '#/definitions/Organization' }]
                },
                User: {
                    type: 'object',
                    properties: { name: { type: 'string' } }
                },
                Organization: {
                    type: 'object',
                    properties: { companyName: { type: 'string' } }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('Entity', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value).sort()).toEqual(['Entity', 'Organization', 'User']);
        }
    });

    it('should handle circular references without infinite loop', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        friends: {
                            type: 'array',
                            items: { $ref: '#/definitions/User' }
                        }
                    }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('User', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value)).toEqual(['User']);
            expect(visitedDefinitions.size).toBe(1);
        }
    });

    it('should handle complex circular references', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        profile: { $ref: '#/definitions/Profile' }
                    }
                },
                Profile: {
                    type: 'object',
                    properties: {
                        bio: { type: 'string' },
                        user: { $ref: '#/definitions/User' }
                    }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('User', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value).sort()).toEqual(['Profile', 'User']);
            expect(visitedDefinitions.size).toBe(2);
        }
    });

    it('should handle nested definitions within schemas', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                Container: {
                    type: 'object',
                    properties: {
                        data: { $ref: '#/definitions/Data' }
                    },
                    definitions: {
                        NestedType: {
                            type: 'string'
                        }
                    }
                },
                Data: {
                    type: 'object',
                    properties: {
                        value: { type: 'string' }
                    }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('Container', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value).sort()).toEqual(['Container', 'Data']);
        }
    });

    it('should return error when root definition does not exist', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                User: {
                    type: 'object',
                    properties: { id: { type: 'string' } }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('NonExistent', rootSchema, visitedDefinitions);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('json_schema doesn\'t contain model "NonExistent"');
        }
    });

    it('should return error when referenced definition does not exist', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        profile: { $ref: '#/definitions/NonExistentProfile' }
                    }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('User', rootSchema, visitedDefinitions);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).toBe('json_schema doesn\'t contain model "NonExistentProfile"');
        }
    });

    it('should handle already visited definitions correctly', () => {
        const userDefinition = {
            type: 'object',
            properties: {
                id: { type: 'string' },
                name: { type: 'string' }
            }
        } as const;

        const rootSchema: JSONSchema7 = {
            definitions: {
                User: userDefinition
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        visitedDefinitions.add(userDefinition);

        const result = getDefinitionsRecursively('User', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value)).toEqual([]);
        }
    });

    it('should handle empty schema objects', () => {
        const rootSchema: JSONSchema7 = {
            definitions: {
                Empty: {},
                Container: {
                    type: 'object',
                    properties: {
                        empty: { $ref: '#/definitions/Empty' }
                    }
                }
            }
        };

        const visitedDefinitions = new Set<JSONSchema7Definition>();
        const result = getDefinitionsRecursively('Container', rootSchema, visitedDefinitions);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(Object.keys(result.value).sort()).toEqual(['Container', 'Empty']);
            expect(result.value['Empty']).toEqual({});
        }
    });
});
