import { describe, expect, it } from 'vitest';

import { rankSessionTools, searchOperationMeta, toolInputOf, trimRelated, withModelDefinitionsHoisted } from './agentSessionToolSearch.service.js';

import type { ToolSlugLookup } from './agentSessionToolSearch.service.js';
import type { AgentSession, AgentSessionCompiledToolset, AgentSessionResolvedConnections, AgentSessionToolMatch } from '@nangohq/types';
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
        metaTools: { nangoToolSearch: true, nangoExecute: true, nangoProxy: false, nangoCreateConnection: { enabled: false, tags: {} } },
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

const ledger: AgentSessionCompiledToolset = {
    xero: {
        provider: 'xero',
        pinned: [],
        searchable: [
            { name: 'list_invoices', description: 'List invoices in the organisation.' },
            { name: 'create_invoice', description: 'Create a draft invoice for a contact.' },
            { name: 'list_contacts', description: 'List contacts.' },
            { name: 'list_accounts', description: 'List the chart of accounts.' }
        ]
    }
};

const messages: AgentSessionCompiledToolset = {
    gmail: {
        provider: 'google-mail',
        pinned: [],
        searchable: [
            { name: 'delete_message', description: 'Delete a message.' },
            { name: 'get_message', description: 'Retrieve a message.' },
            { name: 'list_messages', description: 'List the messages in the mailbox.' }
        ]
    }
};

const issueSchema: JSONSchema7 = { type: 'object', properties: { id: { type: 'string' } } };

const issues: AgentSessionCompiledToolset = {
    linear: {
        provider: 'linear',
        pinned: [],
        searchable: [
            { name: 'update-issue', description: 'Update an issue.', mcp: { inputSchema: issueSchema as Record<string, unknown> } },
            { name: 'update-issue-label', description: 'Update an issue label.' },
            { name: 'update-issue-relation', description: 'Update an issue relation.' }
        ]
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

    it('carries the score each result was ranked on, so a search can be measured afterwards', () => {
        const { best, related } = rank({ compiledToolset: mailbox, query: 'send a message to a customer' });

        expect(best.length).toBeGreaterThan(0);
        expect(related.length).toBeGreaterThan(0);
        expect(best[0]?.score).toBeGreaterThanOrEqual(0);
        expect(best.at(-1)!.score).toBeLessThan(related[0]!.score);
    });

    it('demotes a weak match to related rather than dropping it', () => {
        const { best, related } = rank({ compiledToolset: mailbox, query: 'archive old threads into a folder by label' });

        expect(best).toStrictEqual([]);
        expect(related.map((match) => match.action)).toStrictEqual(['list_labels']);
    });

    it('returns the tool a query phrased as a sentence leads with, though the other words dilute its score', () => {
        const { best, related } = rank({ compiledToolset: ledger, query: 'list unpaid invoices from xero sorted by amount' });

        expect(best[0]?.action).toBe('list_invoices');
        expect(best[0]?.score).toBeGreaterThan(0.4);
        expect(related.map((match) => match.action)).toContain('create_invoice');
    });

    it('promotes the tools tied for the lead when the query cannot tell them apart', () => {
        const { best, tied } = rank({ compiledToolset: ledger, query: 'list' });

        expect(best.map((match) => match.action)).toStrictEqual(['list_accounts', 'list_contacts', 'list_invoices']);
        expect(tied).toBe(true);
    });

    it('promotes at most three tied tools', () => {
        const { best, related, tied } = rank({
            compiledToolset: {
                xero: { provider: 'xero', pinned: [], searchable: [...(ledger['xero']?.searchable ?? []), { name: 'list_items', description: 'List items.' }] }
            },
            query: 'list'
        });

        expect(best.map((match) => match.action)).toStrictEqual(['list_accounts', 'list_contacts', 'list_invoices']);
        expect(related.map((match) => match.action)).toStrictEqual(['list_items']);
        expect(tied).toBe(true);
    });

    it('promotes none of the tools tied on a fit too weak to be a match', () => {
        const { best, related, tied } = rank({ compiledToolset: ledger, query: 'list records' });

        expect(best).toStrictEqual([]);
        expect(related.map((match) => match.action)).toStrictEqual(['list_accounts', 'list_contacts', 'list_invoices']);
        expect(tied).toBe(false);
    });

    it('does not prefer a shorter name that leaves out a query word', () => {
        const { best, tied } = rank({
            compiledToolset: {
                github: {
                    provider: 'github',
                    pinned: [],
                    searchable: [
                        { name: 'create-label', description: 'Create a label in a repository.' },
                        { name: 'create-pull-request', description: 'Create a pull request in a repository.' }
                    ]
                }
            },
            query: 'create repository'
        });

        expect(best.map((match) => match.action)).toStrictEqual(['create-label', 'create-pull-request']);
        expect(tied).toBe(true);
    });

    it('breaks a tie for the lead on the query words a tool holds, stopwords included', () => {
        const { best, related, tied } = rank({ compiledToolset: messages, query: 'get message' });

        expect(best.map((match) => match.action)).toStrictEqual(['get_message']);
        expect(related.map((match) => match.action)).toStrictEqual(['delete_message', 'list_messages']);
        expect(tied).toBe(false);
    });

    it('does not break a tie on a word a tool only approximates', () => {
        const { best, tied } = rank({
            compiledToolset: {
                gmail: {
                    provider: 'google-mail',
                    pinned: [],
                    searchable: [
                        { name: 'delete_message', description: 'Delete a message.' },
                        { name: 'list_messages', description: 'List the messages in the mailbox.' }
                    ]
                }
            },
            query: 'get message'
        });

        // A fuzzy 'get' would pick delete_message.
        expect(best.map((match) => match.action)).toStrictEqual(['delete_message', 'list_messages']);
        expect(tied).toBe(true);
    });

    it('returns the tool a query names by its slug as the only match, with its input', () => {
        const { best, related, tied } = rank({ compiledToolset: issues, query: 'linear__update-issue' });

        expect(best.map((match) => match.slug)).toStrictEqual(['linear__update-issue']);
        expect(best[0]?.input).toStrictEqual({ kind: 'schema', schema: issueSchema });
        expect(related.map((match) => match.action).sort()).toStrictEqual(['update-issue-label', 'update-issue-relation']);
        expect(tied).toBe(false);
    });

    it('returns the tool a query names by an action only it has', () => {
        const { best } = rank({ compiledToolset: issues, query: 'update-issue' });

        expect(best.map((match) => match.slug)).toStrictEqual(['linear__update-issue']);
    });

    it('returns the tool a query names, though its name starts with a stopword', () => {
        const compiledToolset: AgentSessionCompiledToolset = {
            sheets: {
                provider: 'google-sheet',
                pinned: [],
                searchable: [
                    { name: 'create-spreadsheet', description: 'Create a spreadsheet.' },
                    { name: 'get-spreadsheet', description: 'Get a spreadsheet.' },
                    { name: 'get-spreadsheet-values', description: 'Get values from a spreadsheet.' }
                ]
            }
        };

        expect(rank({ compiledToolset, query: 'get-spreadsheet' }).best.map((match) => match.slug)).toStrictEqual(['sheets__get-spreadsheet']);
        expect(rank({ compiledToolset, query: 'get spreadsheet' }).best.map((match) => match.slug)).toStrictEqual(['sheets__get-spreadsheet']);
    });

    it('does not take an action name several tools share as naming one of them', () => {
        const { best, related, tied } = rank({
            compiledToolset: { ...issues, jira: { provider: 'jira', pinned: [], searchable: [{ name: 'update-issue', description: 'Update an issue.' }] } },
            query: 'update-issue'
        });

        expect(best.map((match) => match.slug)).toStrictEqual(['jira__update-issue', 'linear__update-issue']);
        expect(related.map((match) => match.action).sort()).toStrictEqual(['update-issue-label', 'update-issue-relation']);
        expect(tied).toBe(true);
    });

    it('breaks a tie for the tool whose name the query covers most closely', () => {
        const { best, related, tied } = rank({ compiledToolset: issues, query: 'update issue' });

        expect(best.map((match) => match.action)).toStrictEqual(['update-issue']);
        expect(related.map((match) => match.action).sort()).toStrictEqual(['update-issue-label', 'update-issue-relation']);
        expect(tied).toBe(false);
    });

    it('matches a tool whose name is the query, though longer names hold the same words', () => {
        const compiledToolset: AgentSessionCompiledToolset = {
            pinterest: {
                provider: 'pinterest',
                pinned: [],
                searchable: [
                    { name: 'create-board', description: 'Create a board.' },
                    { name: 'create-board-section', description: 'Create a board section.' },
                    { name: 'list-boards', description: 'List boards.' },
                    { name: 'list-following-boards', description: 'List boards the user follows.' },
                    { name: 'list-board-pins', description: 'List pins on a board' }
                ]
            }
        };
        const matchFor = (query: string) => rank({ compiledToolset, query }).best.map((match) => match.action);

        expect(matchFor('create board')).toStrictEqual(['create-board']);
        expect(matchFor('create a board')).toStrictEqual(['create-board']);
        expect(matchFor('list boards')).toStrictEqual(['list-boards']);
        expect(matchFor('list my boards')).toStrictEqual(['list-boards']);
    });

    it('still ties when every tied name leaves out as many words', () => {
        const { best, tied } = rank({
            compiledToolset: {
                pinterest: {
                    provider: 'pinterest',
                    pinned: [],
                    searchable: [
                        { name: 'create-board', description: 'Create a board.' },
                        { name: 'delete-board', description: 'Delete a board.' }
                    ]
                }
            },
            query: 'board'
        });

        expect(best.map((match) => match.action)).toStrictEqual(['create-board', 'delete-board']);
        expect(tied).toBe(true);
    });

    it("carries a tool's tags, without its required scopes", () => {
        const { best } = rank({
            compiledToolset: {
                gmail: {
                    provider: 'google-mail',
                    pinned: [],
                    searchable: [
                        {
                            name: 'list_labels',
                            description: 'List the labels in the mailbox.',
                            tags: { read_only_hint: 'true', required_scopes: { all: ['gmail.readonly'] } }
                        }
                    ]
                }
            },
            query: 'list labels'
        });

        expect(best[0]?.tags).toStrictEqual({ read_only_hint: 'true' });
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
    it('carries the schema an MCP server gave for its tool', () => {
        const schema: JSONSchema7 = { type: 'object', properties: { query: { type: 'string' } } };
        const ranked = rank({
            compiledToolset: {
                'linear-mcp': {
                    provider: 'linear-mcp',
                    pinned: [],
                    searchable: [
                        { name: 'list_issues', description: 'List the issues in a Linear team.', mcp: { inputSchema: schema as Record<string, unknown> } }
                    ],
                    mcpServer: 'available'
                }
            },
            query: 'list issues'
        });

        expect(ranked.best.map((candidate) => candidate.input)).toEqual([{ kind: 'schema', schema }]);
    });

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
        const searchable = [
            { name: 'send_email', description: 'Send an email message.' },
            ...Array.from({ length: 100 }, (_, index) => ({ name: `send_mail_${index}`, description: 'Send mail.' }))
        ];
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
    it('roots the deployed document at the input model, labelled draft-07', () => {
        const schema: JSONSchema7 = { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] };

        expect(toolInputOf(row('UpsertDocInput', { UpsertDocInput: schema }))).toStrictEqual({
            kind: 'schema',
            schema: { $schema: 'http://json-schema.org/draft-07/schema#', definitions: { UpsertDocInput: schema }, $ref: '#/definitions/UpsertDocInput' }
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
                schema: { $schema: 'http://json-schema.org/draft-07/schema#', definitions: { UpsertDocInput: schema }, $ref: '#/definitions/UpsertDocInput' }
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

        expect(input.kind === 'schema' && Object.keys(input.schema['definitions'] as object).sort()).toStrictEqual(['Icon', 'Page', 'UpsertDocInput']);
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

describe('withModelDefinitionsHoisted', () => {
    it('merges definitions nested in the model into the root definitions', () => {
        const model: JSONSchema7 = {
            type: 'object',
            properties: { child: { $ref: '#/definitions/__schema0' } },
            definitions: { __schema0: { type: 'string' } }
        };

        expect(withModelDefinitionsHoisted({ definitions: { UpsertDocInput: model }, $ref: '#/definitions/UpsertDocInput' })).toStrictEqual({
            definitions: { UpsertDocInput: model, __schema0: { type: 'string' } },
            $ref: '#/definitions/UpsertDocInput'
        });
    });

    it.each<JSONSchema7>([
        { definitions: { UpsertDocInput: { type: 'object' } }, $ref: '#/definitions/UpsertDocInput' },
        { definitions: { UpsertDocInput: { type: 'object' } }, $ref: '#/definitions/Missing' },
        { type: 'object' }
    ])('leaves a schema with nothing to hoist unchanged', (schema) => {
        expect(withModelDefinitionsHoisted(schema)).toBe(schema);
    });
});

describe('trimRelated', () => {
    function scored(slug: string, score: number) {
        return {
            slug,
            integration: 'gmail',
            action: slug,
            provider: 'google-mail',
            description: '',
            connection: { status: 'not_connected' } as const,
            listed: false,
            score
        };
    }

    function tools(prefix: string, count: number) {
        return Array.from({ length: count }, (_, index) => scored(`${prefix}_${index}`, 0.5 + index / 100));
    }

    function slugs(ranking: { related: { slug: string }[] } | undefined) {
        return ranking?.related.map(({ slug }) => slug);
    }

    it('keeps fewer related tools when the query already has a match', () => {
        const [withMatch, withoutMatch] = trimRelated([
            { best: [scored('send_email', 0.1)], related: tools('a', 15) },
            { best: [], related: tools('b', 15) }
        ]);

        expect(slugs(withMatch)).toStrictEqual(['a_0', 'a_1', 'a_2']);
        expect(slugs(withoutMatch)).toStrictEqual(['b_0', 'b_1', 'b_2', 'b_3', 'b_4']);
    });

    it('drops a related tool that another query returns as a match', () => {
        const [send, read] = trimRelated([
            { best: [scored('send_email', 0.1)], related: [scored('get_message', 0.6)] },
            { best: [scored('get_message', 0.2)], related: [scored('send_email', 0.7), scored('list_labels', 0.7)] }
        ]);

        expect(slugs(send)).toStrictEqual([]);
        expect(slugs(read)).toStrictEqual(['list_labels']);
    });

    it('lists a tool related to several queries once, under the one it scores best on', () => {
        const [first, second, third] = trimRelated([
            { best: [], related: [scored('list_labels', 0.7)] },
            { best: [], related: [scored('list_labels', 0.5)] },
            { best: [], related: [scored('list_labels', 0.5)] }
        ]);

        expect(slugs(first)).toStrictEqual([]);
        expect(slugs(second)).toStrictEqual(['list_labels']);
        expect(slugs(third)).toStrictEqual([]);
    });

    it('passes a tool on to its next closest query when the closest one is full', () => {
        const [full, open] = trimRelated([
            { best: [scored('send_email', 0.1)], related: [...tools('a', 3), scored('get_thread', 0.6)] },
            { best: [], related: [scored('get_thread', 0.7)] }
        ]);

        expect(slugs(full)).toStrictEqual(['a_0', 'a_1', 'a_2']);
        expect(slugs(open)).toStrictEqual(['get_thread']);
        expect(open?.relatedElsewhere).toBe(false);
    });

    it('fills the cap from deeper down when a query loses tools to another', () => {
        const [first, second] = trimRelated([
            { best: [scored('send_email', 0.1)], related: tools('a', 3) },
            { best: [scored('get_message', 0.1)], related: [...tools('a', 3), ...tools('b', 3)] }
        ]);

        expect(slugs(first)).toStrictEqual(['a_0', 'a_1', 'a_2']);
        expect(slugs(second)).toStrictEqual(['b_0', 'b_1', 'b_2']);
    });

    it('says when a query lost related tools to another query', () => {
        const [first, second, third] = trimRelated([
            { best: [], related: [scored('list_labels', 0.5)] },
            { best: [], related: [scored('list_labels', 0.6)] },
            { best: [], related: [] }
        ]);

        expect(first?.relatedElsewhere).toBe(false);
        expect(second?.relatedElsewhere).toBe(true);
        expect(third?.relatedElsewhere).toBe(false);
    });

    it('trims a single query the same way', () => {
        const [only] = trimRelated([{ best: [scored('send_email', 0.1)], related: tools('a', 15) }]);

        expect(slugs(only)).toHaveLength(3);
        expect(only?.relatedElsewhere).toBe(false);
    });
});

describe('searchOperationMeta', () => {
    function match(tool: string): AgentSessionToolMatch {
        return {
            tool,
            integration: 'gmail',
            description: 'Send an email message to one or more recipients.',
            input: { kind: 'schema', schema: { definitions: { SendEmailInput: { type: 'object' } }, $ref: '#/definitions/SendEmailInput' } }
        };
    }

    it('logs each query with the names of the tools it found, without their descriptions or input', () => {
        expect(
            searchOperationMeta({
                goal: 'email the weekly report to the team',
                results: [
                    { query: 'send an email', matches: [match('gmail__send_email')], related: [match('gmail__list_labels')] },
                    { query: 'list calendar events', matches: [], related: [] }
                ]
            })
        ).toStrictEqual({
            queries: ['send an email', 'list calendar events'],
            goal: 'email the weekly report to the team',
            results: [
                { query: 'send an email', matches: ['gmail__send_email'], related: ['gmail__list_labels'] },
                { query: 'list calendar events', matches: [], related: [] }
            ]
        });
    });
});
