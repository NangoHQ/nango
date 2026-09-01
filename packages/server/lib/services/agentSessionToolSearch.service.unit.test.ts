import { describe, expect, it } from 'vitest';

import { rankSessionTools, toolInputOf } from './agentSessionToolSearch.service.js';

import type { ToolSlugLookup } from './agentSessionToolSearch.service.js';
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

const slugEverything: ToolSlugLookup = ({ integration, action }) => `${integration}__${action}`;

function rank({
    compiledToolset,
    query,
    resolvedConnections = {},
    slugOf = slugEverything
}: {
    compiledToolset: AgentSessionCompiledToolset;
    query: string;
    resolvedConnections?: AgentSessionResolvedConnections;
    slugOf?: ToolSlugLookup;
}) {
    return rankSessionTools({ session: session({ compiledToolset, resolvedConnections }), query, slugOf });
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

        expect(best[0]?.action).toBe('send_email');
    });

    it('matches a tool name the query only approximates', () => {
        const { best } = rank({ compiledToolset: mailbox, query: 'create tickets' });

        expect(best[0]?.action).toBe('create_ticket');
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
                        { name: 'read_doc', description: 'Read a page.' }
                    ]
                }
            },
            query: 'create or update a page'
        });

        // Fails with ignoreFieldNorm off: the long description drops out of the best tier entirely,
        // beaten by the short one that answers a third of the query.
        expect(best.map((match) => match.action)).toStrictEqual(['upsert_doc']);
    });

    it('returns nothing for a query no tool relates to', () => {
        const { best, related } = rank({ compiledToolset: mailbox, query: 'provision a kubernetes cluster' });

        expect(best).toStrictEqual([]);
        expect(related).toStrictEqual([]);
    });

    it('demotes a weak match to related rather than dropping it', () => {
        const { best, related } = rank({ compiledToolset: mailbox, query: 'archive an old label from the mailbox' });

        expect(best).toStrictEqual([]);
        expect(related.map((match) => match.action)).toStrictEqual(['list_labels']);
    });

    it('searches pinned tools too and carries the slug they are listed under', () => {
        const { best, related } = rank({
            compiledToolset: {
                gmail: { provider: 'google-mail', pinned: [{ name: 'send_email', description: 'Send an email message.' }], searchable: [] }
            },
            query: 'send an email',
            slugOf: ({ integration, action }) => (integration === 'gmail' && action === 'send_email' ? 'gmail__send_email' : undefined)
        });

        expect([...best, ...related][0]).toMatchObject({ slug: 'gmail__send_email', action: 'send_email', listed: true });
    });

    /**
     * A slug cannot be derived from the integration and action, so a tool the listing has no address
     * for cannot be called and is left out rather than returned uncallable.
     */
    it('leaves out a tool the listing has no address for', () => {
        const { best, related } = rank({
            compiledToolset: {
                gmail: { provider: 'google-mail', pinned: [], searchable: [{ name: 'send_email', description: 'Send an email message.' }] }
            },
            query: 'send an email',
            slugOf: () => undefined
        });

        expect([...best, ...related]).toStrictEqual([]);
    });

    it('carries the resolved connection, and reports an integration the session never connected', () => {
        const { best } = rank({ compiledToolset: mailbox, query: 'send an email', resolvedConnections: connection('gmail', 'gmail-acme') });

        expect(best[0]?.connection).toStrictEqual({ status: 'connected', connection_id: 'gmail-acme' });

        const unconnected = rank({ compiledToolset: mailbox, query: 'open a support ticket' });

        expect(unconnected.best[0]?.connection).toStrictEqual({ status: 'not_connected' });
    });

    /**
     * An integration id may be `constructor`, `toString` or any other property Object carries, and
     * reading one off the resolved connections would report it connected with no connection id while
     * the execute path refuses to run it.
     */
    it('does not read an inherited property as a resolved connection', () => {
        const { best, related } = rank({
            compiledToolset: {
                constructor: { provider: 'notion', pinned: [], searchable: [{ name: 'read_doc', description: 'Read a document.' }] }
            },
            query: 'read a document'
        });

        expect([...best, ...related][0]?.connection).toStrictEqual({ status: 'not_connected' });
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
    it('roots the deployed document at the input model', () => {
        const schema: JSONSchema7 = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] };

        expect(toolInputOf(row('UpsertDocInput', { UpsertDocInput: schema }))).toStrictEqual({
            kind: 'schema',
            schema: { definitions: { UpsertDocInput: schema }, $ref: '#/definitions/UpsertDocInput' }
        });
    });

    it('reports a tool with no input model as taking nothing', () => {
        expect(toolInputOf(row(null))).toStrictEqual({ kind: 'none' });
    });

    it('reports an input it cannot read as unavailable rather than as taking nothing', () => {
        expect(toolInputOf(row('UpsertDocInput'))).toStrictEqual({ kind: 'unavailable' });
        expect(toolInputOf(row('UpsertDocInput', {}))).toStrictEqual({ kind: 'unavailable' });
        expect(toolInputOf(row('Missing', { UpsertDocInput: { type: 'object' } }))).toStrictEqual({ kind: 'unavailable' });
    });

    /**
     * The schema is passed through rather than interpreted, so a root that is not an object is handed
     * over like any other. nango_execute takes any JSON value, and the deployed schema decides.
     */
    it('passes through a root that is not an object', () => {
        const roots: JSONSchema7[] = [
            { type: 'array', items: { type: 'string' } },
            { type: 'null' },
            { type: 'string' },
            { oneOf: [{ type: 'object' }, { type: 'string' }] },
            { not: { type: 'object' } }
        ];

        for (const schema of roots) {
            expect(toolInputOf(row('UpsertDocInput', { UpsertDocInput: schema }))).toStrictEqual({
                kind: 'schema',
                schema: { definitions: { UpsertDocInput: schema }, $ref: '#/definitions/UpsertDocInput' }
            });
        }
    });

    it('carries the definitions the input model points at, transitively, and leaves the rest out', () => {
        const input = toolInputOf(
            row('UpsertDocInput', {
                UpsertDocInput: { type: 'object', properties: { parent: { $ref: '#/definitions/Page' } } },
                Page: { type: 'object', properties: { icon: { $ref: '#/definitions/Icon' } } },
                Icon: { type: 'object', properties: { emoji: { type: 'string' } } },
                Unrelated: { type: 'object' }
            })
        );

        expect(input.kind === 'schema' && Object.keys(input.schema.definitions ?? {}).sort()).toStrictEqual(['Icon', 'Page', 'UpsertDocInput']);
    });

    it('terminates on a model that references itself', () => {
        const input = toolInputOf(
            row('UpsertDocInput', {
                UpsertDocInput: { type: 'object', properties: { child: { $ref: '#/definitions/UpsertDocInput' } } }
            })
        );

        expect(input.kind).toBe('schema');
    });

    it('does not read an inherited property as a definition', () => {
        expect(toolInputOf(row('constructor', { UpsertDocInput: { type: 'object' } }))).toStrictEqual({ kind: 'unavailable' });
    });
});
