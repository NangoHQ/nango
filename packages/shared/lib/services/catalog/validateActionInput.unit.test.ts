import { describe, expect, it } from 'vitest';

import { getCatalogTool, getFlowsJson } from './actions.js';
import { validateActionInput } from './validateActionInput.js';

import type { ResolvedLegacyAction } from './resolveLegacyAction.js';
import type { JSONSchema7 } from 'json-schema';

let nextId = 0;
function deployed(schema: JSONSchema7 | null, model: string | null = 'Input'): Exclude<ResolvedLegacyAction, { kind: 'missing' }> {
    return { kind: 'deployed', config: { id: ++nextId, version: '1', input: model, models_json_schema: schema } } as Exclude<
        ResolvedLegacyAction,
        { kind: 'missing' }
    >;
}

const objectSchema: JSONSchema7 = {
    definitions: { Input: { type: 'object', properties: { calendarId: { type: 'string' } }, required: ['calendarId'], additionalProperties: false } }
};

describe('validateActionInput', () => {
    it('rejects JSON-encoded object input without parsing it', () => {
        const action = deployed(objectSchema);
        const result = validateActionInput(action, '{"calendarId":"primary"}');
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.code).toBe('invalid_input');
            expect(result.error.message).toContain('input must be object');
        }
        expect(validateActionInput(action, { calendarId: 'primary' }).isOk()).toBe(true);
    });

    it.each([undefined, {}, { calendarId: 123 }, { calendarId: 'primary', extra: true }])('rejects invalid object input %j', (input) => {
        expect(validateActionInput(deployed(objectSchema), input).isErr()).toBe(true);
    });

    it.each([
        { type: 'array', input: ['primary'] },
        { type: 'string', input: '{"calendarId":"primary"}' },
        { type: 'number', input: 0 },
        { type: 'boolean', input: false },
        { type: 'null', input: null }
    ] as const)('preserves valid $type inputs', ({ type, input }) => {
        expect(validateActionInput(deployed({ definitions: { Input: { type } } }), input).isOk()).toBe(true);
    });

    it('supports nested references and reports a missing field', () => {
        const schema: JSONSchema7 = {
            definitions: {
                Input: { type: 'object', properties: { event: { $ref: '#/definitions/Event' } }, required: ['event'] },
                Event: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] }
            }
        };
        const action = deployed(schema);
        expect(validateActionInput(action, { event: { summary: 'Focus time' } }).isOk()).toBe(true);
        const result = validateActionInput(action, { event: {} });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) expect(result.error.message).toContain('summary');
    });

    it('preserves omitted input for optional object and null schemas', () => {
        for (const schema of [{ type: 'object', properties: {} }, { type: 'null' }] as const) {
            expect(validateActionInput(deployed({ definitions: { Input: schema } }), undefined).isOk()).toBe(true);
        }
    });

    it('accepts empty MCP arguments for no-input actions without accepting nonempty values', () => {
        const action = deployed({ definitions: { Input: { type: 'null' } } });
        expect(validateActionInput(action, {}).isOk()).toBe(true);
        expect(validateActionInput(action, { unexpected: true }).isErr()).toBe(true);
        expect(validateActionInput(action, []).isErr()).toBe(true);
        expect(validateActionInput(action, '').isErr()).toBe(true);
    });

    it('keeps deployments without a JSON schema compatible', () => {
        expect(validateActionInput(deployed(null), 'legacy input').isOk()).toBe(true);
        expect(validateActionInput(deployed(objectSchema, null), undefined).isOk()).toBe(true);
    });

    it('distinguishes an invalid schema from invalid caller input', () => {
        const result = validateActionInput(deployed({ definitions: {} }), {});
        expect(result.isErr()).toBe(true);
        if (result.isErr()) expect(result.error.code).toBe('invalid_schema');
    });

    it('rejects encoded input for the actual Calendar create-event catalog schema', () => {
        const tool = getCatalogTool('google-calendar', 'create-event');
        expect(tool).toBeDefined();
        if (!tool) throw new Error('Missing Calendar catalog action');
        const action = { kind: 'catalog' as const, tool };
        const input = {
            calendarId: 'primary',
            summary: 'Focus time',
            start: { dateTime: '2026-11-20T11:00:00-03:00' },
            end: { dateTime: '2026-11-20T12:00:00-03:00' }
        };
        expect(validateActionInput(action, input).isOk()).toBe(true);
        expect(validateActionInput(action, JSON.stringify(input)).isErr()).toBe(true);
    });

    it('resolves embedded JSON value definitions in the PayPal patch schema', () => {
        const tool = getCatalogTool('paypal', 'update-order');
        if (!tool) throw new Error('Missing PayPal catalog action');
        const action = { kind: 'catalog' as const, tool };
        expect(validateActionInput(action, { id: 'order', patch: [{ op: 'add', path: '/value', value: { nested: [true, null, 'text'] } }] }).isOk()).toBe(true);
        expect(validateActionInput(action, { id: 'order', patch: [{ op: 'invalid', path: '/value' }] }).isErr()).toBe(true);
    });

    it.each(getFlowsJson())('can compile the input schemas for $providerConfigKey', (integration) => {
        const failures: string[] = [];
        for (const action of integration.actions) {
            const tool = getCatalogTool(integration.providerConfigKey, action.name);
            if (!tool) throw new Error('Missing catalog action');
            const result = validateActionInput({ kind: 'catalog', tool }, undefined);
            if (result.isErr() && result.error.code === 'invalid_schema')
                failures.push(`${integration.providerConfigKey}/${action.name}: ${String(result.error.cause)}`);
        }
        expect(failures).toEqual([]);
    });
});
