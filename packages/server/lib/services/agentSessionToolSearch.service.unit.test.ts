import { describe, expect, it } from 'vitest';

import { rankSessionTools, toolInputOf } from './agentSessionToolSearch.service.js';

import type { ListedNameLookup } from './agentSessionToolSearch.service.js';
import type { AgentSession, AgentSessionCompiledToolset, AgentSessionResolvedConnections } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

function session({
    compiledToolset = {},
    resolvedConnections = {}
}: {
    compiledToolset?: AgentSessionCompiledToolset;
    resolvedConnections?: AgentSessionResolvedConnections;
} = {}): AgentSession {
    return {
        id: 'session-1',
        environmentId: 1,
        accountId: 1,
        resolvedConnections,
        compiledToolset,
        metaTools: { nangoToolSearch: true, nangoExecute: true },
        expiresAt: new Date(),
        endedAt: null,
        endedReason: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

function connection(integrationId: string, connectionId: string): AgentSessionResolvedConnections {
    return {
        [integrationId]: { integrationId, provider: integrationId, connectionId, internalConnectionId: 1, configId: 1 }
    };
}

function rank({
    compiledToolset,
    query,
    resolvedConnections = {},
    listedNameFor = () => undefined
}: {
    compiledToolset: AgentSessionCompiledToolset;
    query: string;
    resolvedConnections?: AgentSessionResolvedConnections;
    listedNameFor?: ListedNameLookup;
}) {
    return rankSessionTools({ session: session({ compiledToolset, resolvedConnections }), query, listedNameFor });
}

const mailbox: AgentSessionCompiledToolset = {
    gmail: {
        provider: 'google-mail',
        pinned: [],
        searchable: [
            { name: 'send_email', description: 'Send an email message to one or more recipients.' },
            { name: 'list_labels', description: 'List the labels in the mailbox.' }
        ]
    },
    zendesk: {
        provider: 'zendesk',
        pinned: [],
        searchable: [{ name: 'create_ticket', description: 'Open a support ticket for a customer.' }]
    }
};

describe('rankSessionTools', () => {
    it('finds a tool by what it does rather than by its name', () => {
        const { best } = rank({ compiledToolset: mailbox, query: 'send a message to a recipient' });

        expect(best[0]?.tool).toBe('send_email');
    });

    it('matches a tool name the query only approximates', () => {
        const { best } = rank({ compiledToolset: mailbox, query: 'create tickets' });

        expect(best[0]?.tool).toBe('create_ticket');
    });

    it('matches on the integration and the provider name', () => {
        const byIntegration = rank({ compiledToolset: mailbox, query: 'zendesk' });
        const byProvider = rank({ compiledToolset: mailbox, query: 'google-mail' });

        expect(byIntegration.best.map((match) => match.integration)).toContain('zendesk');
        expect([...byProvider.best, ...byProvider.related].map((match) => match.integration)).toContain('gmail');
    });

    it('does not penalise a tool for describing itself at length', () => {
        const { best } = rank({
            compiledToolset: {
                notion: {
                    provider: 'notion',
                    pinned: [],
                    searchable: [
                        { name: 'upsert_doc', description: 'Create or update a page in a Notion workspace, by title or by id.' },
                        { name: 'read_doc', description: 'read_doc' }
                    ]
                }
            },
            query: 'create or update a page'
        });

        expect(best[0]?.tool).toBe('upsert_doc');
    });

    it('returns nothing for a query no tool relates to', () => {
        const { best, related } = rank({ compiledToolset: mailbox, query: 'provision a kubernetes cluster' });

        expect(best).toStrictEqual([]);
        expect(related).toStrictEqual([]);
    });

    it('demotes a weak match to related rather than dropping it', () => {
        const { best, related } = rank({ compiledToolset: mailbox, query: 'label' });

        expect([...best, ...related].map((match) => match.tool)).toContain('list_labels');
    });

    it('searches pinned tools too and marks the name they are listed under', () => {
        const { best, related } = rank({
            compiledToolset: {
                gmail: { provider: 'google-mail', pinned: [{ name: 'send_email', description: 'Send an email message.' }], searchable: [] }
            },
            query: 'send an email',
            listedNameFor: ({ integration, tool }) => (integration === 'gmail' && tool === 'send_email' ? 'gmail__send_email' : undefined)
        });

        expect([...best, ...related][0]).toMatchObject({ tool: 'send_email', listedAs: 'gmail__send_email' });
    });

    it('carries the resolved connection, and reports an integration the session never connected', () => {
        const { best } = rank({ compiledToolset: mailbox, query: 'send an email', resolvedConnections: connection('gmail', 'gmail-acme') });

        expect(best[0]?.connection).toStrictEqual({ status: 'connected', connection_id: 'gmail-acme' });

        const unconnected = rank({ compiledToolset: mailbox, query: 'open a support ticket' });

        expect(unconnected.best[0]?.connection).toStrictEqual({ status: 'not_connected' });
    });

    it('caps each tier so a large toolset cannot flood the context window', () => {
        const searchable = Array.from({ length: 100 }, (_, index) => ({ name: `send_email_${index}`, description: 'Send an email message.' }));
        const { best, related } = rank({ compiledToolset: { gmail: { provider: 'google-mail', pinned: [], searchable } }, query: 'send an email' });

        expect(best).toHaveLength(5);
        expect(related).toHaveLength(15);
    });

    it('ranks the same way every time it is asked', () => {
        const once = rank({ compiledToolset: mailbox, query: 'send an email' });
        const twice = rank({ compiledToolset: mailbox, query: 'send an email' });

        expect(once).toStrictEqual(twice);
    });
});

function row(input: string | null, definitions?: Record<string, JSONSchema7>) {
    return {
        integration_id: 'notion',
        name: 'upsert_doc',
        input,
        models_json_schema: definitions ? { definitions } : null
    };
}

describe('toolInputOf', () => {
    it('returns the input model as an object schema', () => {
        const schema: JSONSchema7 = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] };

        expect(toolInputOf(row('UpsertDocInput', { UpsertDocInput: schema }))).toStrictEqual({ kind: 'object', schema });
    });

    it('reports a tool that takes nothing, however that was deployed', () => {
        expect(toolInputOf(row(null))).toStrictEqual({ kind: 'none' });
        expect(toolInputOf(row('UpsertDocInput', { UpsertDocInput: { type: 'null' } }))).toStrictEqual({ kind: 'none' });
    });

    /**
     * The distinction the guidance rests on: a tool whose arguments could not be read must not be
     * described as one that takes none, because nango_execute only accepts a JSON object.
     */
    it('does not pass an unreadable or non-object input off as taking no arguments', () => {
        expect(toolInputOf(row('UpsertDocInput', {}))).toStrictEqual({ kind: 'unsupported' });
        expect(toolInputOf(row('UpsertDocInput'))).toStrictEqual({ kind: 'unsupported' });
        expect(toolInputOf(row('UpsertDocInput', { UpsertDocInput: { type: 'array', items: { type: 'string' } } }))).toStrictEqual({ kind: 'unsupported' });
        expect(toolInputOf(row('UpsertDocInput', { UpsertDocInput: { oneOf: [{ type: 'object' }, { type: 'string' }] } }))).toStrictEqual({
            kind: 'unsupported'
        });
    });

    it('carries the sibling definitions the schema points at, following them transitively', () => {
        const input = toolInputOf(
            row('UpsertDocInput', {
                UpsertDocInput: { type: 'object', properties: { parent: { $ref: '#/definitions/Page' } } },
                Page: { type: 'object', properties: { icon: { $ref: '#/definitions/Icon' } } },
                Icon: { type: 'object', properties: { emoji: { type: 'string' } } },
                Unrelated: { type: 'object' }
            })
        );

        expect(input.kind).toBe('object');
        expect(input.kind === 'object' && input.schema.definitions).toStrictEqual({
            Page: { type: 'object', properties: { icon: { $ref: '#/definitions/Icon' } } },
            Icon: { type: 'object', properties: { emoji: { type: 'string' } } }
        });
    });

    /**
     * The current generator inlines a reused model and emits a pointer only for a cycle, whose target
     * it nests inside the model. Those already resolve against the lifted schema, so pulling siblings
     * in must not overwrite them.
     */
    it('keeps a definition nested in the model over a sibling of the same name', () => {
        const nested: JSONSchema7 = { type: 'object', properties: { self: { $ref: '#/definitions/__schema0' } } };
        const input = toolInputOf(
            row('UpsertDocInput', {
                UpsertDocInput: {
                    type: 'object',
                    properties: { patch: { $ref: '#/definitions/__schema0' } },
                    definitions: { __schema0: nested }
                },
                __schema0: { type: 'object', properties: { wrong: { type: 'string' } } }
            })
        );

        expect(input.kind === 'object' && input.schema.definitions?.['__schema0']).toStrictEqual(nested);
    });

    it('leaves a schema that points at nothing untouched', () => {
        const schema: JSONSchema7 = { type: 'object', properties: { title: { type: 'string' } } };
        const input = toolInputOf(row('UpsertDocInput', { UpsertDocInput: schema, Unrelated: { type: 'object' } }));

        expect(input.kind === 'object' && input.schema).toStrictEqual(schema);
    });

    it('terminates on a schema that references itself', () => {
        const input = toolInputOf(
            row('UpsertDocInput', {
                UpsertDocInput: { type: 'object', properties: { child: { $ref: '#/definitions/UpsertDocInput' } } }
            })
        );

        expect(input.kind).toBe('object');
    });
});
