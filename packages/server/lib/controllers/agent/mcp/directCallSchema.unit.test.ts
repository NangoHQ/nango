import { describe, expect, it } from 'vitest';

import { directCallInputSchema } from './directCallSchema.js';

describe('directCallInputSchema', () => {
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
