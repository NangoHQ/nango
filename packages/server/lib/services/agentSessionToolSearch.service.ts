import Fuse from 'fuse.js';

import { legacyFunctionService } from '@nangohq/shared';
import { filterJsonSchemaForModels } from '@nangohq/utils';

import type { ActionInputSchemaRow } from '@nangohq/shared';
import type { AgentSession, AgentSessionToolConnectionState, AgentSessionToolInput, AgentSessionToolMatch, AgentSessionToolSearchResult } from '@nangohq/types';

const DEFINITIONS_POINTER = '#/definitions/';

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
        { name: 'action', weight: 0.45 },
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

// Ranked from 0, everything matched, to 1, nothing matched.
const BEST_MATCH_SCORE = 0.4;
const MAX_MATCH_SCORE = 0.85;

const MAX_BEST_MATCHES = 5;
const MAX_RELATED_MATCHES = 15;

interface SearchCandidate {
    slug: string;
    integration: string;
    action: string;
    provider: string;
    description: string;
    connection: AgentSessionToolConnectionState;
    listed: boolean;
}

/**
 * The name nango_execute takes for a tool. It cannot be derived from the integration and action,
 * since sanitising and clipping can collide and the loser gets numbered.
 */
export type ToolSlugLookup = (tool: { integration: string; action: string }) => string | undefined;

export async function searchSessionTools({
    session,
    query,
    slugOf
}: {
    session: AgentSession;
    query: string;
    slugOf: ToolSlugLookup;
}): Promise<AgentSessionToolSearchResult> {
    const ranked = rankSessionTools({ session, query, slugOf });
    const inputs = await findToolInputs({ environmentId: session.environmentId, candidates: ranked.best });

    // It's possible a tool was removed after the session compiled, so we set input as unavailable.
    const matches = ranked.best.map((candidate) => toMatch(candidate, inputs.get(candidate.integration)?.get(candidate.action) ?? { kind: 'unavailable' }));
    const related = ranked.related.map((candidate) => toMatch(candidate, undefined));

    return { guidance: guidanceFor({ query, matches, related }), matches, related };
}

export function rankSessionTools({ session, query, slugOf }: { session: AgentSession; query: string; slugOf: ToolSlugLookup }): {
    best: SearchCandidate[];
    related: SearchCandidate[];
} {
    const candidates = buildSearchCandidateList({ session, slugOf });
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
            (a, b) =>
                a.score - b.score || a.candidate.integration.localeCompare(b.candidate.integration) || a.candidate.action.localeCompare(b.candidate.action)
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

function buildSearchCandidateList({ session, slugOf }: { session: AgentSession; slugOf: ToolSlugLookup }): SearchCandidate[] {
    return Object.entries(session.compiledToolset).flatMap(([integration, compiled]) => {
        const connection = connectionStateFor({ session, integration });

        // Pinned is exactly what the session lists, so it is also what an agent can name directly.
        const tools = [...compiled.pinned.map((tool) => ({ tool, listed: true })), ...compiled.searchable.map((tool) => ({ tool, listed: false }))];

        return tools.flatMap(({ tool, listed }): SearchCandidate[] => {
            // A tool with no name cannot be called, so returning it would only waste the agent's turn.
            const slug = slugOf({ integration, action: tool.name });

            return slug
                ? [
                      {
                          slug,
                          integration,
                          action: tool.name,
                          provider: compiled.provider,
                          description: tool.description,
                          connection,
                          listed
                      }
                  ]
                : [];
        });
    });
}

function connectionStateFor({ session, integration }: { session: AgentSession; integration: string }): AgentSessionToolConnectionState {
    // An integration id may be any of `constructor`, `toString` and friends, so an inherited property
    // would otherwise report an integration as connected with no connection id. The execute path
    // rejects the same id, which is the disagreement this avoids.
    const resolved = own(session.resolvedConnections, integration);

    return resolved ? { status: 'connected', connection_id: resolved.connectionId } : { status: 'not_connected' };
}

function own<T>(record: Record<string, T>, key: string): T | undefined {
    return Object.hasOwn(record, key) ? record[key] : undefined;
}

async function findToolInputs({
    environmentId,
    candidates
}: {
    environmentId: number;
    candidates: SearchCandidate[];
}): Promise<Map<string, Map<string, AgentSessionToolInput>>> {
    const rows = await legacyFunctionService.findActionInputSchemas({
        environmentId,
        actions: candidates.map((candidate) => ({ integrationId: candidate.integration, name: candidate.action }))
    });

    const inputs = new Map<string, Map<string, AgentSessionToolInput>>();
    for (const row of rows) {
        let byTool = inputs.get(row.integration_id);
        if (!byTool) {
            byTool = new Map<string, AgentSessionToolInput>();
            inputs.set(row.integration_id, byTool);
        }

        byTool.set(row.name, toolInputOf(row));
    }

    return inputs;
}

/**
 * An action's arguments are the schema it was deployed with, rooted at its input model. The document
 * is handed over as it is stored, pointers and all, which is the same shape the function input
 * validator compiles, so search cannot advertise a schema execution would reject.
 */
export function toolInputOf(row: ActionInputSchemaRow): AgentSessionToolInput {
    if (!row.input) {
        return { kind: 'none' };
    }

    const document = row.models_json_schema;
    if (!document?.definitions || Object.keys(document.definitions).length === 0) {
        return { kind: 'unavailable' };
    }

    const filtered = filterJsonSchemaForModels(document, [row.input]);
    if (filtered.isErr()) {
        return { kind: 'unavailable' };
    }

    return { kind: 'schema', schema: { ...filtered.value, $ref: `${DEFINITIONS_POINTER}${row.input}` } };
}

function toMatch(candidate: SearchCandidate, input: AgentSessionToolInput | undefined): AgentSessionToolMatch {
    return {
        tool: candidate.slug,
        integration: candidate.integration,
        action: candidate.action,
        provider: candidate.provider,
        description: candidate.description,
        listed: candidate.listed,
        connection: candidate.connection,
        ...(input ? { input } : {})
    };
}

function guidanceFor({ query, matches, related }: { query: string; matches: AgentSessionToolMatch[]; related: AgentSessionToolMatch[] }): string {
    if (matches.length === 0 && related.length === 0) {
        return `No tool in this session matches '${query}'. Try a shorter query, or words describing the operation rather than the product, and note that this session may simply not carry a tool for it.`;
    }

    const lines: string[] = [];

    if (matches.length > 0) {
        lines.push(
            `${matches.length} ${matches.length === 1 ? 'tool matches' : 'tools match'} '${query}'. Call nango_execute with the tool of the one you want, exactly as given, and the input its schema describes. A schema is a JSON Schema document rooted at its \`$ref\`.`
        );

        const takesNothing = matches.filter((match) => match.input?.kind === 'none');
        if (takesNothing.length > 0) {
            lines.push(`${toolNames(takesNothing)} ${takesNothing.length === 1 ? 'takes' : 'take'} no arguments.`);
        }

        const unreadable = matches.filter((match) => match.input?.kind === 'unavailable');
        if (unreadable.length > 0) {
            lines.push(
                `The arguments of ${toolNames(unreadable)} could not be read, so ${unreadable.length === 1 ? 'it has' : 'they have'} to be called on a guess at the shape, and may fail.`
            );
        }
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

    const alreadyListed = [...matches, ...related].filter((match) => match.listed);
    if (alreadyListed.length > 0) {
        lines.push(`${toolNames(alreadyListed)} ${alreadyListed.length === 1 ? 'is' : 'are'} also in your tool list under the same name.`);
    }

    const unconnected = [...new Set([...matches, ...related].filter((match) => match.connection.status === 'not_connected').map((match) => match.integration))];
    if (unconnected.length > 0) {
        lines.push(
            `${unconnected.map((integration) => `'${integration}'`).join(', ')} ${unconnected.length === 1 ? 'has' : 'have'} no connection in this session. Their tools are listed for completeness and will fail if you call them.`
        );
    }

    return lines.join(' ');
}

function toolNames(matches: AgentSessionToolMatch[]): string {
    return matches.map((match) => `'${match.tool}'`).join(', ');
}
