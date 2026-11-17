import Fuse from 'fuse.js';

import { logContextGetter } from '@nangohq/logs';
import { functionLookupService } from '@nangohq/shared';
import { filterJsonSchemaForModels, report } from '@nangohq/utils';

import { notConnectedGuidance } from '../controllers/agent/mcp/notConnectedGuidance.js';
import { withConnectionsCreatedInSession } from '../controllers/agent/mcp/sessionConnection.js';
import { trackAgentSessionToolSearch } from './agentSessionAnalytics.service.js';

import type { ActionInputSchemaRow } from '@nangohq/shared';
import type {
    AgentSession,
    AgentSessionToolConnectionState,
    AgentSessionToolInput,
    AgentSessionToolMatch,
    AgentSessionToolRelated,
    AgentSessionToolSearchHit,
    AgentSessionToolSearchIntegrationState,
    AgentSessionToolSearchQueryResult,
    AgentSessionToolSearchResult,
    DBEnvironment,
    DBTeam
} from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

const DEFINITIONS_POINTER = '#/definitions/';
const JSON_SCHEMA_DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

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

const LEADING_MATCH_SCORE = 0.65;
const LEADING_MATCH_MARGIN = 0.1;

const MAX_BEST_MATCHES = 5;
const MAX_RELATED_WITH_MATCH = 3;
const MAX_RELATED_WITHOUT_MATCH = 5;
// Kept deeper than either cap, so a query that loses tools to another query in the same call still has some left.
const MAX_RELATED_CANDIDATES = 15;

interface SearchCandidate {
    slug: string;
    integration: string;
    action: string;
    provider: string;
    description: string;
    connection: AgentSessionToolConnectionState;
    listed: boolean;
    input?: AgentSessionToolInput;
}

/** A candidate with the score it was ranked on, so how well a search did outlives the ranking. */
type ScoredCandidate = SearchCandidate & { score: number };

/**
 * The name nango_execute takes for a tool. It cannot be derived from the integration and action,
 * since sanitising and clipping can collide and the loser gets numbered.
 */
export type ToolSlugLookup = (tool: { integration: string; action: string }) => string | undefined;

export async function searchSessionTools({
    account,
    environment,
    session,
    queries,
    goal,
    slugOf
}: {
    account: DBTeam;
    environment: DBEnvironment;
    session: AgentSession;
    queries: string[];
    goal: string;
    slugOf: ToolSlugLookup;
}): Promise<AgentSessionToolSearchResult> {
    const logCtx = await logContextGetter.create(
        { operation: { type: 'agent_session', action: 'tool_search' } },
        { account, environment, meta: { queries, goal } }
    );
    await logCtx.enrichOperation({ actor: { kind: 'session', id: session.id } });

    try {
        const current = await withConnectionsCreatedInSession(session).catch((err: unknown) => {
            report(err);
            void logCtx.warn('Could not look up connections created in this session', { error: err });
            return session;
        });
        const ranked = trimRelated(queries.map((query) => ({ query, ...rankSessionTools({ session: current, query, slugOf }) })));
        const inputs = await findToolInputs({ environmentId: session.environmentId, candidates: ranked.flatMap(({ best }) => best) });

        const results = ranked.map(({ query, best, related: weaker, relatedElsewhere, tied }): AgentSessionToolSearchQueryResult => {
            // It's possible a tool was removed after the session compiled, so we set input as unavailable.
            const matches = best.map((candidate) =>
                toMatch(candidate, candidate.input ?? inputs.get(candidate.integration)?.get(candidate.action) ?? { kind: 'unavailable' })
            );
            const related = weaker.map(toRelated);
            const guidance = queryGuidance({ matches, related, relatedElsewhere, tied });

            return { query, ...(guidance ? { guidance } : {}), matches, related };
        });
        const returned = ranked.flatMap(({ best, related }) => [...best, ...related]);

        await logCtx.enrichOperation({ meta: searchOperationMeta({ goal, results }) });
        for (const { query, matches } of results) {
            void logCtx.info(`Tool search for '${query}' returned ${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`);
        }
        await logCtx.success();

        for (const { query, best, related } of ranked) {
            trackAgentSessionToolSearch({
                session,
                query,
                queryCount: queries.length,
                goal,
                matches: searchHits(best),
                related: searchHits(related),
                logOperationId: logCtx.id
            });
        }

        return { guidance: searchGuidance({ session, results, returned }), integrations: integrationStates(returned), results };
    } catch (err) {
        void logCtx.error('Failed to search the session tools', { error: err });
        await logCtx.failed();

        for (const query of queries) {
            trackAgentSessionToolSearch({
                session,
                query,
                queryCount: queries.length,
                goal,
                matches: [],
                related: [],
                logOperationId: logCtx.id,
                errorCode: 'search_failed'
            });
        }

        throw err;
    }
}

export function rankSessionTools({ session, query, slugOf }: { session: AgentSession; query: string; slugOf: ToolSlugLookup }): {
    best: ScoredCandidate[];
    related: ScoredCandidate[];
    tied: boolean;
} {
    const candidates = buildSearchCandidateList({ session, slugOf });
    const { scored, lead } = breakLeadingTie({ scored: scoreCandidates({ candidates, terms: queryTerms(query) }), query });
    const bestMatchScore = bestMatchScoreFor(scored[0]?.score);
    const maxBest = lead === 'single' ? MAX_BEST_MATCHES : lead === 'tie_broken' ? 1 : 0;

    const best: ScoredCandidate[] = [];
    const related: ScoredCandidate[] = [];

    for (const { candidate, score } of scored) {
        if (score <= bestMatchScore && best.length < maxBest) {
            best.push({ ...candidate, score });
        } else if (related.length < MAX_RELATED_CANDIDATES) {
            related.push({ ...candidate, score });
        }
    }

    // A tie among tools too weak to match anyway is not worth telling the agent about.
    return { best, related, tied: lead === 'tied' && (scored[0]?.score ?? 1) <= bestMatchScore };
}

/**
 * Several tools sharing the top score would each come back with a full schema, though the query
 * cannot tell them apart. The tie goes to the leader whose name and description hold the most query
 * words exactly, stopwords included, so 'get message' picks get-message over delete-message. Exact,
 * since a fuzzy 'get' also hits 'delete'. The winner is then the only match. A tie that holds even
 * so promotes nothing, and the agent picks from the related tools.
 */
function breakLeadingTie({ scored, query }: { scored: { candidate: SearchCandidate; score: number }[]; query: string }): {
    scored: { candidate: SearchCandidate; score: number }[];
    lead: 'single' | 'tie_broken' | 'tied';
} {
    const top = scored[0]?.score;
    const leaders = scored.filter(({ score }) => top !== undefined && sameScore(score, top));
    if (leaders.length < 2) {
        return { scored, lead: 'single' };
    }

    const words = new Set(queryWords(query).map(singular));
    const wordsFound = new Map(
        leaders.map(({ candidate }) => {
            const own = new Set(queryWords(`${candidate.action} ${candidate.description}`).map(singular));
            return [candidate, [...words].filter((word) => own.has(word)).length];
        })
    );
    const tieBreak = ({ candidate }: { candidate: SearchCandidate }) => wordsFound.get(candidate) ?? 0;
    const reordered = [...leaders].sort((a, b) => tieBreak(b) - tieBreak(a));

    const [first, second] = reordered;
    const broken = first !== undefined && second !== undefined && tieBreak(first) > tieBreak(second);

    return { scored: [...reordered, ...scored.slice(leaders.length)], lead: broken ? 'tie_broken' : 'tied' };
}

function sameScore(a: number, b: number): boolean {
    return Math.abs(a - b) < 1e-9;
}

function singular(word: string): string {
    return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

// Unmatched query words can give even a well-fitting top tool a high score, so the cutting line follows the top result.
// If there are no matches or the top one is weaker than LEADING_MATCH_SCORE, the cutting line is BEST_MATCH_SCORE.
// Else it is whichever is greater, BEST_MATCH_SCORE or topScore plus a margin. Lower scores are better matches.
function bestMatchScoreFor(topScore: number | undefined): number {
    if (topScore === undefined || topScore > LEADING_MATCH_SCORE) {
        return BEST_MATCH_SCORE;
    }

    return Math.max(BEST_MATCH_SCORE, topScore + LEADING_MATCH_MARGIN);
}

/**
 * A related tool is listed once per call, and not at all when another query already returns it as a
 * match. Tools are placed best score first, each under the closest query that still has room, so a
 * query that is full passes a tool on rather than dropping it. A query with a match gets fewer, since
 * the agent already has a tool to call. Matches are left alone, so every query keeps its own answer.
 */
export function trimRelated<T extends { best: ScoredCandidate[]; related: ScoredCandidate[] }>(rankings: T[]): (T & { relatedElsewhere: boolean })[] {
    const matched = new Set(rankings.flatMap(({ best }) => best.map((candidate) => candidate.slug)));
    const kept = rankings.map(({ best }) => ({ max: best.length > 0 ? MAX_RELATED_WITH_MATCH : MAX_RELATED_WITHOUT_MATCH, tools: [] as ScoredCandidate[] }));
    const placedIn = new Map<string, number>();

    const offers = rankings
        .flatMap(({ related }, index) => related.map((candidate) => ({ index, candidate })))
        .sort((a, b) => a.candidate.score - b.candidate.score || a.index - b.index);

    for (const { index, candidate } of offers) {
        const query = kept[index];
        if (!query || matched.has(candidate.slug) || placedIn.has(candidate.slug) || query.tools.length >= query.max) {
            continue;
        }

        query.tools.push(candidate);
        placedIn.set(candidate.slug, index);
    }

    return rankings.map((ranking, index) => ({
        ...ranking,
        related: kept[index]?.tools ?? [],
        relatedElsewhere: ranking.related.some(({ slug }) => matched.has(slug) || (placedIn.get(slug) ?? index) !== index)
    }));
}

/**
 * Scored a word at a time rather than as one string, because Fuse matches a query as a single
 * pattern and a use case phrased as a sentence then matches nothing at all. Every word counts the
 * same, so a tool answering three of four words outranks one that answers a single word exactly.
 */
function scoreCandidates({ candidates, terms }: { candidates: SearchCandidate[]; terms: string[] }): { candidate: SearchCandidate; score: number }[] {
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
    const words = queryWords(query);
    const meaningful = words.filter((word) => word.length > 1 && !STOPWORDS.has(word));

    return meaningful.length > 0 ? meaningful : words;
}

function queryWords(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
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
                          listed,
                          ...(tool.mcp ? { input: { kind: 'schema', schema: tool.mcp.inputSchema as JSONSchema7 } as const } : {})
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
    return await findActionInputs({
        environmentId,
        actions: candidates.filter((candidate) => !candidate.input).map((candidate) => ({ integrationId: candidate.integration, name: candidate.action }))
    });
}

/** Inputs keyed by integration id, then action name. An action missing from the result is no longer deployed. */
export async function findActionInputs({
    environmentId,
    actions
}: {
    environmentId: number;
    actions: { integrationId: string; name: string }[];
}): Promise<Map<string, Map<string, AgentSessionToolInput>>> {
    const rows = await functionLookupService.findInputSchemas({ environmentId, actions });

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
 * is handed over as it is stored, pointers and all, which is the same draft-07 shape the function
 * input validator compiles, so search cannot advertise a schema execution would reject.
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

    return { kind: 'schema', schema: { $schema: JSON_SCHEMA_DRAFT_07, ...filtered.value, $ref: `${DEFINITIONS_POINTER}${row.input}` } };
}

/**
 * The input model can carry definitions of its own that its $refs point at from the document root,
 * so they are merged into the root definitions for the schema to resolve when the model is nested.
 */
export function withModelDefinitionsHoisted(schema: JSONSchema7): JSONSchema7 {
    const { $ref, definitions } = schema;
    const model = $ref?.startsWith(DEFINITIONS_POINTER) ? definitions?.[$ref.slice(DEFINITIONS_POINTER.length)] : undefined;
    if (typeof model !== 'object' || !model.definitions) {
        return schema;
    }

    return { ...schema, definitions: { ...definitions, ...model.definitions } };
}

/** Only what identifies a tool, since a full match carries a description and an input schema. */
export function searchOperationMeta({ goal, results }: { goal: string; results: AgentSessionToolSearchQueryResult[] }): {
    queries: string[];
    goal: string;
    results: { query: string; matches: string[]; related: string[] }[];
} {
    return {
        queries: results.map(({ query }) => query),
        goal,
        results: results.map(({ query, matches, related }) => ({
            query,
            matches: matches.map((match) => match.tool),
            related: related.map((match) => match.tool)
        }))
    };
}

function toRelated(candidate: SearchCandidate): AgentSessionToolRelated {
    return { tool: candidate.slug, integration: candidate.integration, description: candidate.description };
}

// The dialect URL would repeat on every match, and the guidance already says what the schemas are.
function toMatch(candidate: SearchCandidate, input: AgentSessionToolInput): AgentSessionToolMatch {
    if (input.kind !== 'schema') {
        return { ...toRelated(candidate), input };
    }

    const schema = { ...input.schema };
    delete schema.$schema;
    return { ...toRelated(candidate), input: { kind: 'schema', schema } };
}

function integrationStates(candidates: SearchCandidate[]): Record<string, AgentSessionToolSearchIntegrationState> {
    return Object.fromEntries(candidates.map(({ integration, connection }) => [integration, connection.status]));
}

/** What holds for the whole call, said once rather than under every query it applies to. */
function searchGuidance({
    session,
    results,
    returned
}: {
    session: AgentSession;
    results: AgentSessionToolSearchQueryResult[];
    returned: SearchCandidate[];
}): string {
    if (returned.length === 0) {
        return 'No query matched a tool in this session.';
    }

    const lines: string[] = [];

    if (results.some(({ matches }) => matches.length > 0)) {
        lines.push(
            "Call `nango_execute` with a match's `tool`, exactly as given, and an input that fits its schema.",
            'Schemas are JSON Schema, rooted at their `$ref` when they have one.'
        );
    }

    if (results.some(({ related }) => related.length > 0)) {
        lines.push('Related tools come without a schema. Search again with wording closer to one to get it.');
    }

    const listed = [...new Set(returned.filter((candidate) => candidate.listed).map(({ slug }) => slug))];
    if (listed.length > 0) {
        lines.push(`${codeList(listed)} ${listed.length === 1 ? 'is' : 'are'} also in your tool list under the same name.`);
    }

    const unconnected = [...new Set(returned.filter(({ connection }) => connection.status === 'not_connected').map(({ integration }) => integration))];
    for (const integration of unconnected) {
        lines.push(`\`${integration}\` has no connection in this session, so its tools will fail. ${notConnectedGuidance(integration, session)}`);
    }

    return lines.join('\n');
}

function queryGuidance({
    matches,
    related,
    relatedElsewhere,
    tied
}: {
    matches: AgentSessionToolMatch[];
    related: AgentSessionToolRelated[];
    relatedElsewhere: boolean;
    tied: boolean;
}): string | undefined {
    if (matches.length === 0 && related.length === 0) {
        return relatedElsewhere
            ? 'No close match. The closest tools are listed under another query.'
            : 'No tool in this session matches. Try a shorter query, or words for the operation rather than the product. This session may not carry a tool for it.';
    }

    const lines: string[] = [];

    if (matches.length === 0) {
        lines.push(
            tied
                ? 'Several tools fit equally well, so none is a match. Search again with the `tool` of the one you want to get its schema.'
                : 'No close match, only related tools.'
        );
    }

    const takesNothing = matches.filter(({ input }) => input.kind === 'none').map(({ tool }) => tool);
    if (takesNothing.length > 0) {
        lines.push(`${codeList(takesNothing)} ${takesNothing.length === 1 ? 'takes' : 'take'} no arguments.`);
    }

    const unreadable = matches.filter(({ input }) => input.kind === 'unavailable').map(({ tool }) => tool);
    if (unreadable.length > 0) {
        lines.push(`The arguments of ${codeList(unreadable)} could not be read. Guess the shape, and expect the call may fail.`);
    }

    return lines.length > 0 ? lines.join('\n') : undefined;
}

function codeList(names: string[]): string {
    return names.map((name) => `\`${name}\``).join(', ');
}

/** Scores run from 0, everything matched, to 1, nothing matched, and the event reports the other way round. */
function searchHits(candidates: ScoredCandidate[]): AgentSessionToolSearchHit[] {
    return candidates.map((candidate) => ({
        tool_name: candidate.action,
        tool_slug: candidate.slug,
        integration_id: candidate.integration,
        confidence: Math.round((1 - candidate.score) * 100) / 100
    }));
}
