import Fuse from 'fuse.js';

import { legacyFunctionService } from '@nangohq/shared';

import type { ActionInputSchemaRow } from '@nangohq/shared';
import type { AgentSession, AgentSessionToolConnectionState, AgentSessionToolInput, AgentSessionToolMatch, AgentSessionToolSearchResult } from '@nangohq/types';
import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';

const DEFINITIONS_POINTER = '#/definitions/';

/** Guards against a union that nests into itself. Real input models are nowhere near this deep. */
const MAX_SCHEMA_DEPTH = 8;

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
    const inputs = await findToolInputs({ environmentId: session.environmentId, candidates: ranked.best });

    // A best match with no row left to read is one whose action went away after the session compiled
    // its toolset, which is a tool whose arguments we cannot state rather than one that takes none.
    const matches = ranked.best.map((candidate) => toMatch(candidate, inputs.get(candidate.integration)?.get(candidate.tool) ?? { kind: 'unsupported' }));
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
        actions: candidates.map((candidate) => ({ integrationId: candidate.integration, name: candidate.tool }))
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
 * An action declares its input as a model name resolved against the schema definitions it was
 * deployed with. Three shapes mean it takes nothing: no input model at all, an input model typed as
 * null, and, on rows deployed before the input model was always written, a missing definition.
 */
export function toolInputOf(row: ActionInputSchemaRow): AgentSessionToolInput {
    if (!row.input) {
        return { kind: 'none' };
    }

    const definitions = row.models_json_schema?.definitions;
    const schema = definitions ? own(definitions, row.input) : undefined;

    if (!schema) {
        return { kind: 'unsupported' };
    }

    const resolved = resolveRef(schema, definitions);

    if (resolved?.type === 'null') {
        return { kind: 'none' };
    }

    // An input that cannot be an object cannot be expressed as the arguments a tool call carries.
    if (!acceptsObject(schema, definitions, 0)) {
        return { kind: 'unsupported' };
    }

    return { kind: 'object', schema: withReferencedDefinitions(schema, definitions) };
}

/**
 * Whether the schema can accept the JSON object a tool call carries.
 *
 * Deployed schemas are stored without their bodies being inspected, so the input model is not always
 * a plain `type: 'object'`: it can point at one, name several types, or offer an object as one branch
 * of a union. Rejecting those would withhold the arguments of a tool that is perfectly callable.
 */
function acceptsObject(schema: JSONSchema7, definitions: Record<string, JSONSchema7> | undefined, depth: number): boolean {
    const resolved = depth <= MAX_SCHEMA_DEPTH ? resolveRef(schema, definitions) : undefined;
    if (!resolved) {
        return false;
    }

    // Each keyword present is a constraint the same value has to satisfy at once, so all of them are
    // checked rather than whichever appears first. A keyword that is absent constrains nothing.
    const { type, allOf, oneOf, anyOf } = resolved;
    const accepts = (branch: JSONSchema7Definition) => (typeof branch === 'boolean' ? branch : acceptsObject(branch, definitions, depth + 1));

    if (type !== undefined && !(Array.isArray(type) ? type.includes('object') : type === 'object')) {
        return false;
    }

    // Every member of an allOf has to hold, where one member of a oneOf or an anyOf is enough.
    if (allOf && allOf.length > 0 && !allOf.every(accepts)) {
        return false;
    }

    if (oneOf && oneOf.length > 0 && !oneOf.some(accepts)) {
        return false;
    }

    if (anyOf && anyOf.length > 0 && !anyOf.some(accepts)) {
        return false;
    }

    return true;
}

/** Follows a chain of `$ref`s to the schema that actually states a shape, or undefined if it dangles. */
function resolveRef(schema: JSONSchema7, definitions: Record<string, JSONSchema7> | undefined): JSONSchema7 | undefined {
    const seen = new Set<string>();
    let current: JSONSchema7 | undefined = schema;

    while (current?.$ref) {
        const pointer: string = current.$ref;
        if (!pointer.startsWith(DEFINITIONS_POINTER) || seen.has(pointer)) {
            return undefined;
        }

        seen.add(pointer);
        const name = pointer.slice(DEFINITIONS_POINTER.length);
        current = definitions ? own(definitions, name) : undefined;
    }

    return current;
}

/**
 * Pulls in the sibling definitions a schema points at, because a definition lifted out of the
 * document it was stored in takes its `#/definitions/...` pointers with it and no longer resolves
 * them.
 *
 * Definitions already nested inside the schema win. The current generator inlines a reused model and
 * emits a pointer only for a cycle, whose target it nests, so those pointers resolve against the
 * lifted schema exactly as they should. Overwriting them with the document's own definitions would
 * break the schemas this is meant to repair.
 */
function withReferencedDefinitions(schema: JSONSchema7, definitions: Record<string, JSONSchema7> | undefined): JSONSchema7 {
    if (!definitions) {
        return schema;
    }

    const reachable: Record<string, JSONSchema7> = {};
    const seen = new Set<string>();
    let frontier: unknown[] = [schema];

    while (frontier.length > 0) {
        const pointers = new Set<string>();
        for (const node of frontier) {
            collectRefs(node, pointers);
        }

        frontier = [];
        for (const pointer of pointers) {
            if (!pointer.startsWith(DEFINITIONS_POINTER)) {
                continue;
            }

            const name = pointer.slice(DEFINITIONS_POINTER.length);
            if (seen.has(name)) {
                continue;
            }
            seen.add(name);

            const sibling = own(definitions, name);
            if (sibling) {
                reachable[name] = sibling;
                frontier.push(sibling);
            }
        }
    }

    if (Object.keys(reachable).length === 0) {
        return schema;
    }

    return { ...schema, definitions: { ...reachable, ...schema.definitions } };
}

function collectRefs(node: unknown, into: Set<string>): void {
    if (Array.isArray(node)) {
        for (const item of node) {
            collectRefs(item, into);
        }
        return;
    }

    if (!node || typeof node !== 'object') {
        return;
    }

    for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') {
            into.add(value);
        } else {
            collectRefs(value, into);
        }
    }
}

function toMatch(candidate: SearchCandidate, input: AgentSessionToolInput | undefined): AgentSessionToolMatch {
    return {
        integration: candidate.integration,
        provider: candidate.provider,
        tool: candidate.tool,
        description: candidate.description,
        connection: candidate.connection,
        ...(candidate.listedAs ? { listed_as: candidate.listedAs } : {}),
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
            `${matches.length} ${matches.length === 1 ? 'tool matches' : 'tools match'} '${query}'. Call nango_execute with the integration and tool of the one you want, and the arguments its input schema describes.`
        );

        const takesNothing = matches.filter((match) => match.input?.kind === 'none');
        if (takesNothing.length > 0) {
            lines.push(`${toolNames(takesNothing)} ${takesNothing.length === 1 ? 'takes' : 'take'} no arguments.`);
        }

        const unreadable = matches.filter((match) => match.input?.kind === 'unsupported');
        if (unreadable.length > 0) {
            lines.push(
                `The arguments of ${toolNames(unreadable)} could not be read, or are not the JSON object a tool call takes, so calling ${unreadable.length === 1 ? 'it' : 'them'} may fail.`
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

function toolNames(matches: AgentSessionToolMatch[]): string {
    return matches.map((match) => `'${match.tool}'`).join(', ');
}
