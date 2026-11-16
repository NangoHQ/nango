import { describe, expect, it } from 'vitest';

import { directCallInputSchema } from './directCallSchema.js';

describe('directCallInputSchema', () => {
    it('nests the tool input next to a required goal and intent', () => {
        expect(directCallInputSchema({ type: 'array', items: { type: 'string' } })).toMatchObject({
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: { input: { type: 'array', items: { type: 'string' } }, goal: { type: 'string' }, intent: { type: 'string' } },
            required: ['input', 'goal', 'intent'],
            additionalProperties: false
        });
    });

    it('takes only a goal and an intent for a tool with no input', () => {
        expect(directCallInputSchema('none')).toMatchObject({ properties: { goal: {}, intent: {} }, required: ['goal', 'intent'] });
        expect(directCallInputSchema('none').properties).not.toHaveProperty('input');
    });

    it('keeps refs into the definitions pointing at the root, where the definitions are hoisted', () => {
        const schema = directCallInputSchema({
            type: 'object',
            properties: { node: { $ref: '#/$defs/Node' } },
            $defs: { Node: { type: 'object', properties: { children: { type: 'array', items: { $ref: '#/$defs/Node' } } } } }
        });

        expect(schema).toMatchObject({
            properties: { input: { properties: { node: { $ref: '#/$defs/Node' } } } },
            $defs: { Node: { properties: { children: { items: { $ref: '#/$defs/Node' } } } } }
        });
        expect(schema.properties?.['input']).not.toHaveProperty('$defs');
    });

    it('points a recursive root ref at the nested input, not the wrapper', () => {
        const schema = directCallInputSchema({
            type: 'object',
            properties: { name: { type: 'string' }, children: { type: 'array', items: { $ref: '#' } } }
        });

        expect(schema).toMatchObject({ properties: { input: { properties: { children: { items: { $ref: '#/properties/input' } } } } } });
    });

    it('rebases a ref into another part of the input schema', () => {
        const schema = directCallInputSchema({
            type: 'object',
            properties: { value: { type: 'string' }, fallback: { $ref: '#/properties/value' } }
        });

        expect(schema).toMatchObject({ properties: { input: { properties: { fallback: { $ref: '#/properties/input/properties/value' } } } } });
    });

    it('rebases refs inside a property named like a keyword', () => {
        const schema = directCallInputSchema({
            type: 'object',
            properties: {
                value: { type: 'string' },
                default: { $ref: '#/properties/value' },
                enum: { type: 'object', properties: { children: { type: 'array', items: { $ref: '#' } } } }
            }
        });

        expect(schema).toMatchObject({
            properties: {
                input: {
                    properties: {
                        default: { $ref: '#/properties/input/properties/value' },
                        enum: { properties: { children: { items: { $ref: '#/properties/input' } } } }
                    }
                }
            }
        });
    });

    it('nests a schema with its own $id untouched, so its refs keep resolving against it', () => {
        const toolInput = {
            $id: 'https://example.com/tree.json',
            type: 'object',
            properties: { children: { type: 'array', items: { $ref: '#' } }, self: { $ref: 'https://example.com/tree.json#/properties/children' } },
            $defs: { Leaf: { type: 'string' } }
        };

        const { $id, ...rest } = toolInput;
        expect(directCallInputSchema(toolInput)).toMatchObject({ properties: { input: { $id, ...rest } }, required: ['input', 'goal', 'intent'] });
        expect(directCallInputSchema(toolInput)).not.toHaveProperty('$defs');
    });

    it('leaves a nested resource alone, since its refs resolve against its own $id', () => {
        const nested = { $id: 'https://example.com/node.json', type: 'object', properties: { next: { $ref: '#' } } };

        const schema = directCallInputSchema({ type: 'object', properties: { node: nested, list: { type: 'array', items: { $ref: '#' } } } });

        expect(schema).toMatchObject({ properties: { input: { properties: { node: nested, list: { items: { $ref: '#/properties/input' } } } } } });
    });

    it('keeps rebasing past an empty $id, which keeps the current scope', () => {
        const schema = directCallInputSchema({
            $id: '',
            type: 'object',
            properties: { node: { $id: '', properties: { up: { $ref: '#' } } } }
        });

        expect(schema).toMatchObject({ properties: { input: { properties: { node: { properties: { up: { $ref: '#/properties/input' } } } } } } });
    });

    it('keeps rebasing inside a draft-07 anchor, which is not a resource of its own', () => {
        const schema = directCallInputSchema({ type: 'object', properties: { node: { $id: '#node', properties: { up: { $ref: '#' } } } } });

        expect(schema).toMatchObject({ properties: { input: { properties: { node: { $id: '#node', properties: { up: { $ref: '#/properties/input' } } } } } } });
    });

    it('leaves anchors, remote refs and data that only looks like a ref alone', () => {
        const schema = directCallInputSchema({
            type: 'object',
            properties: {
                anchored: { $ref: '#node' },
                remote: { $ref: 'https://example.com/schema.json#/properties/x' },
                literal: { const: { $ref: '#/properties/value' } }
            }
        });

        expect(schema).toMatchObject({
            properties: {
                input: {
                    properties: {
                        anchored: { $ref: '#node' },
                        remote: { $ref: 'https://example.com/schema.json#/properties/x' },
                        literal: { const: { $ref: '#/properties/value' } }
                    }
                }
            }
        });
    });
});
