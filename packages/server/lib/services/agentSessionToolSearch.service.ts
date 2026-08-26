import Fuse from 'fuse.js';

import { legacyFunctionService } from '@nangohq/shared';

import type { ActionInputSchemaRow } from '@nangohq/shared';
import type { AgentSession, AgentSessionToolConnectionState, AgentSessionToolMatch, AgentSessionToolSearchResult } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const FUSE_OPTIONS: NonNullable<ConstructorParameters<typeof Fuse<SearchCandidate>>[1]> = {
    includeScore: true,
    // Both default to false, and both quietly rank a tool that describes itself properly below one
    // whose description is little more than its own name: the first scores on where in a field a
    // match falls, the second discounts a match by the length of the field holding it.
    ignoreLocation: true,
    ignoreFieldNorm: true,
    threshold: 0.4,
    minMatchCharLength: 2,
    keys: [
        { name: 'tool', weight: 0.45 },
        { name: 'description', weight: 0.35 },
        { name: 'integration', weight: 0.1 },
        { name: 'provider', weight: 0.1 }
    ]
};

// Dropped so the words carrying the meaning are not diluted by the ones around them.
const STOPWORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'can',
    'do',
    'for',
    'from',
    'get',
    'how',
    'i',
    'in',
    'is',
    'it',
    'me',
    'my',
    'need',
    'of',
    'on',
    'or',
    'that',
    'the',
    'their',
    'them',
    'then',
    'this',
    'to',
    'want',
    'was',
    'what',
    'when',
    'which',
    'with',
    'you',
    'your'
]);

/**
 * Scores run from 0 for a tool that matches every word in the query to 1 for one that matches none.
 * At or under the best score a tool is worth handing back ready to call, and past the match score a
 * tool caught one incidental word and is noise.
 */
const BEST_MATCH_SCORE = 0.4;
const MAX_MATCH_SCORE = 0.85;

const MAX_BEST_MATCHES = 5;
const MAX_RELATED_MATCHES = 15;

interface SearchCandidate {
    integration: string;
    provider: string;
    tool: string;
    description: string;
    connection: AgentSessionToolConnectionState;
    listedAs: string | undefined;
}

export type ListedNameLookup = (tool: { integration: string; tool: string }) => string | undefined;

export async function searchSessionTools({
    session,
    query,
    listedNameFor
}: {
    session: AgentSession;
    query: string;
    listedNameFor: ListedNameLookup;
}): Promise<AgentSessionToolSearchResult> {
    const ranked = rankSessionTools({ session, query, listedNameFor });
    const schemas = await findInputSchemas({ environmentId: session.environmentId, candidates: ranked.best });

    const matches = ranked.best.map((candidate) => toMatch(candidate, schemas.get(candidate.integration)?.get(candidate.tool)));
    const related = ranked.related.map((candidate) => toMatch(candidate, undefined));

    return { guidance: guidanceFor({ query, matches, related }), matches, related };
}

export function rankSessionTools({ session, query, listedNameFor }: { session: AgentSession; query: string; listedNameFor: ListedNameLookup }): {
    best: SearchCandidate[];
    related: SearchCandidate[];
} {
    const candidates = searchCandidates({ session, listedNameFor });
    const scored = scoreCandidates({ candidates, query });

    const best: SearchCandidate[] = [];
    const related: SearchCandidate[] = [];

    for (const { candidate, score } of scored) {
        if (score <= BEST_MATCH_SCORE && best.length < MAX_BEST_MATCHES) {
            best.push(candidate);
        } else if (related.length < MAX_RELATED_MATCHES) {
            related.push(candidate);
        }
    }

    return { best, related };
}

/**
 * Scored a word at a time rather than as one string, because Fuse matches a query as a single
 * pattern and a use case phrased as a sentence then matches nothing at all. Every word counts the
 * same, so a tool answering three of four words outranks one that answers a single word exactly.
 */
function scoreCandidates({ candidates, query }: { candidates: SearchCandidate[]; query: string }): { candidate: SearchCandidate; score: number }[] {
    const terms = queryTerms(query);
    if (terms.length === 0) {
        return [];
    }

    const fuse = new Fuse(candidates, FUSE_OPTIONS);
    const matched = new Map<number, number>();

    for (const term of terms) {
        for (const hit of fuse.search(term)) {
            matched.set(hit.refIndex, (matched.get(hit.refIndex) ?? 0) + (1 - (hit.score ?? 1)));
        }
    }

    return [...matched.entries()]
        .flatMap(([index, accounted]) => {
            const candidate = candidates[index];
            const score = 1 - accounted / terms.length;

            return candidate && score <= MAX_MATCH_SCORE ? [{ candidate, score }] : [];
        })
        .sort(
            (a, b) => a.score - b.score || a.candidate.integration.localeCompare(b.candidate.integration) || a.candidate.tool.localeCompare(b.candidate.tool)
        );
}

/**
 * A query with nothing but stopwords in it is searched as written, on the grounds that a caller who
 * searched for 'how to' meant something by it and an empty result teaches them nothing.
 */
function queryTerms(query: string): string[] {
    const words = query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    const meaningful = words.filter((word) => word.length > 1 && !STOPWORDS.has(word));

    return meaningful.length > 0 ? meaningful : words;
}

/**
 * Every tool the session can reach, pinned ones included. A pinned tool is already in the agent's
 * tool list, but leaving it out of the results would answer "nothing here does that" about a tool
 * the agent is holding, so it is returned and marked with the name it is listed under.
 */
function searchCandidates({ session, listedNameFor }: { session: AgentSession; listedNameFor: ListedNameLookup }): SearchCandidate[] {
    return Object.entries(session.compiledToolset).flatMap(([integration, compiled]) => {
        const connection = connectionStateFor({ session, integration });

        return [...compiled.pinned, ...compiled.searchable].map(
            (tool): SearchCandidate => ({
                integration,
                provider: compiled.provider,
                tool: tool.name,
                description: tool.description,
                connection,
                listedAs: listedNameFor({ integration, tool: tool.name })
            })
        );
    });
}

function connectionStateFor({ session, integration }: { session: AgentSession; integration: string }): AgentSessionToolConnectionState {
    const resolved = session.resolvedConnections[integration];

    return resolved ? { status: 'connected', connection_id: resolved.connectionId } : { status: 'not_connected' };
}

async function findInputSchemas({
    environmentId,
    candidates
}: {
    environmentId: number;
    candidates: SearchCandidate[];
}): Promise<Map<string, Map<string, JSONSchema7>>> {
    const rows = await legacyFunctionService.findActionInputSchemas({
        environmentId,
        actions: candidates.map((candidate) => ({ integrationId: candidate.integration, name: candidate.tool }))
    });

    const schemas = new Map<string, Map<string, JSONSchema7>>();
    for (const row of rows) {
        const schema = inputSchemaOf(row);
        if (schema) {
            let byTool = schemas.get(row.integration_id);
            if (!byTool) {
                byTool = new Map<string, JSONSchema7>();
                schemas.set(row.integration_id, byTool);
            }

            byTool.set(row.name, schema);
        }
    }

    return schemas;
}

/**
 * An action declares its input as a model name resolved against the schema definitions it was
 * deployed with. An action that takes nothing has no input model, or one typed as null, and an
 * input that is not an object cannot be expressed as tool arguments.
 */
function inputSchemaOf(row: ActionInputSchemaRow): JSONSchema7 | undefined {
    if (!row.input) {
        return undefined;
    }

    const schema = row.models_json_schema?.definitions?.[row.input];
    if (!schema || schema.type !== 'object') {
        return undefined;
    }

    return schema;
}

function toMatch(candidate: SearchCandidate, inputSchema: JSONSchema7 | undefined): AgentSessionToolMatch {
    return {
        integration: candidate.integration,
        provider: candidate.provider,
        tool: candidate.tool,
        description: candidate.description,
        connection: candidate.connection,
        ...(candidate.listedAs ? { listed_as: candidate.listedAs } : {}),
        ...(inputSchema ? { input_schema: inputSchema } : {})
    };
}

function guidanceFor({ query, matches, related }: { query: string; matches: AgentSessionToolMatch[]; related: AgentSessionToolMatch[] }): string {
    if (matches.length === 0 && related.length === 0) {
        return `No tool in this session matches '${query}'. Try a shorter query, or words describing the operation rather than the product, and note that this session may simply not carry a tool for it.`;
    }

    const lines: string[] = [];

    if (matches.length > 0) {
        lines.push(
            `${matches.length} ${matches.length === 1 ? 'tool matches' : 'tools match'} '${query}'. Call nango_execute with the integration and tool of the one you want, and the arguments its input_schema describes. A match with no input_schema takes no arguments.`
        );
    } else {
        lines.push(
            `No tool closely matches '${query}', but ${related.length} ${related.length === 1 ? 'is' : 'are'} related. Search again with wording closer to one of them to get its input schema.`
        );
    }

    if (matches.length > 0 && related.length > 0) {
        lines.push(
            `${related.length} more ${related.length === 1 ? 'tool is' : 'tools are'} loosely related, listed without their input schemas. Search again to pull one up.`
        );
    }

    const alreadyListed = [...matches, ...related].filter((match) => match.listed_as);
    if (alreadyListed.length > 0) {
        lines.push(
            `${alreadyListed.map((match) => `'${match.listed_as}'`).join(', ')} ${alreadyListed.length === 1 ? 'is' : 'are'} already in your tool list and can be called directly.`
        );
    }

    const unconnected = [...new Set([...matches, ...related].filter((match) => match.connection.status === 'not_connected').map((match) => match.integration))];
    if (unconnected.length > 0) {
        lines.push(
            `${unconnected.map((integration) => `'${integration}'`).join(', ')} ${unconnected.length === 1 ? 'has' : 'have'} no connection in this session. Their tools are listed for completeness and will fail if you call them.`
        );
    }

    return lines.join(' ');
}
