import Fuse from 'fuse.js';

import { logContextGetter } from '@nangohq/logs';
import { functionLookupService } from '@nangohq/shared';
import { filterJsonSchemaForModels, report } from '@nangohq/utils';

import { notConnectedGuidance } from '../controllers/agent/mcp/notConnectedGuidance.js';
import { withConnectionsCreatedInSession } from '../controllers/agent/mcp/sessionConnection.js';
import { trackAgentSessionToolSearch } from './agentSessionAnalytics.service.js';
import { clientToolTags, TAGS_META_KEY } from './agentSessionToolTags.js';

import type { ClientToolTags } from './agentSessionToolTags.js';
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

const BEST_MATCH_SCORE = 0.4;
const MAX_MATCH_SCORE = 0.85;

const LEADING_MATCH_SCORE = 0.65;
const LEADING_MATCH_MARGIN = 0.1;

const MAX_BEST_MATCHES = 5;
const MAX_TIED_MATCHES = 3;
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
    tags?: ClientToolTags;
}

/** A candidate with the score it was ranked on, so how well a search did outlives the ranking. */
type ScoredCandidate = SearchCandidate & { score: number };

/**
 * The name nango_execute takes for a tool. It cannot be derived from the integration and action,
 * since sanitising and clipping can collide and the loser gets numbered.
 */
export type ToolSlugLookup = (tool: { integration: string; action: string }) => string | undefined;

/**
 * Searches the session's tools, one ranking per query, and returns each query's matches with
 * their input schema and its related tools by name only.
 *
 * A query that names a tool is that tool's match (toolNamed). Any other query is scored word by
 * word against every tool in the session (scoreCandidates), cut
 * into matches and related tools at a line that follows the top score (bestMatchScoreFor), with
 * a tie for the top broken or capped (breakLeadingTie). Related tools are then trimmed
 * across the queries in the call, so each is listed once (trimRelated).
 */
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

/** Keeps at most MAX_BEST_MATCHES matches, and MAX_RELATED_CANDIDATES related tools for trimRelated to pick from. */
export function rankSessionTools({ session, query, slugOf }: { session: AgentSession; query: string; slugOf: ToolSlugLookup }): {
    best: ScoredCandidate[];
    related: ScoredCandidate[];
    tied: boolean;
} {
    const candidates = buildSearchCandidateList({ session, slugOf });

    const named = toolNamed({ candidates, query });
    if (named) {
        const others = scoreCandidates({ candidates: candidates.filter((candidate) => candidate !== named), terms: queryTerms(query) });
        return {
            best: [{ ...named, score: 0 }],
            related: others.slice(0, MAX_RELATED_CANDIDATES).map(({ candidate, score }) => ({ ...candidate, score })),
            tied: false
        };
    }

    const { scored, lead, tiedCount } = breakLeadingTie({ scored: scoreCandidates({ candidates, terms: queryTerms(query) }), query });
    const topScore = scored[0]?.score ?? 1;
    const bestMatchScore = bestMatchScoreFor(scored[0]?.score);
    // Tools tied on a weak fit each answer only part of the query, so none is worth a schema.
    const tiedClosely = lead === 'tied' && topScore <= BEST_MATCH_SCORE;
    const maxBest = lead === 'single' ? MAX_BEST_MATCHES : lead === 'tie_broken' ? 1 : tiedClosely ? Math.min(tiedCount, MAX_TIED_MATCHES) : 0;

    const best: ScoredCandidate[] = [];
    const related: ScoredCandidate[] = [];

    for (const { candidate, score } of scored) {
        if (score <= bestMatchScore && best.length < maxBest) {
            best.push({ ...candidate, score });
        } else if (related.length < MAX_RELATED_CANDIDATES) {
            related.push({ ...candidate, score });
        }
    }

    return { best, related, tied: tiedClosely };
}

/**
 * A query that is a tool's slug names that tool, and so does an action name only one tool in the
 * session has. Scoring is skipped, since a name already says which tool is meant.
 */
function toolNamed({ candidates, query }: { candidates: SearchCandidate[]; query: string }): SearchCandidate | undefined {
    const name = query.trim().toLowerCase();
    const bySlug = candidates.find((candidate) => candidate.slug.toLowerCase() === name);
    if (bySlug) {
        return bySlug;
    }

    const byAction = candidates.filter((candidate) => candidate.action.toLowerCase() === name);
    return byAction.length === 1 ? byAction[0] : undefined;
}

/**
 * When several tools share the top score, the one whose name and description hold the most query
 * words, stopwords included, is the only match. Between tools whose names each hold every meaningful
 * query word, the one whose name has the fewest words the query left out is, so 'create board' is
 * create-board and not create-board-section. A name missing a query word has no claim to be the
 * closer fit for being shorter, or 'create repository' would be create-label. If neither
 * tells them apart, the tools still level at the top are all matches, up to MAX_TIED_MATCHES, for
 * the agent to pick between on their descriptions. Words are compared exactly, since a fuzzy 'get'
 * also hits 'delete'.
 */
function breakLeadingTie({ scored, query }: { scored: { candidate: SearchCandidate; score: number }[]; query: string }): {
    scored: { candidate: SearchCandidate; score: number }[];
    lead: 'single' | 'tie_broken' | 'tied';
    tiedCount: number;
} {
    const top = scored[0]?.score;
    const leaders = scored.filter(({ score }) => top !== undefined && sameScore(score, top));
    if (leaders.length < 2) {
        return { scored, lead: 'single', tiedCount: 1 };
    }

    const words = new Set(queryWords(query).map(singular));
    const terms = queryTerms(query).map(singular);
    const fit = new Map(
        leaders.map(({ candidate }) => {
            const own = new Set(queryWords(`${candidate.action} ${candidate.description}`).map(singular));
            const nameWords = new Set(queryWords(candidate.action).map(singular));
            return [
                candidate,
                {
                    wordsFound: [...words].filter((word) => own.has(word)).length,
                    namesEveryTerm: terms.every((term) => nameWords.has(term)),
                    nameWordsLeftOut: [...nameWords].filter((word) => !words.has(word)).length
                }
            ];
        })
    );
    const compare = (a: { candidate: SearchCandidate }, b: { candidate: SearchCandidate }): number => {
        const fitA = fit.get(a.candidate);
        const fitB = fit.get(b.candidate);
        if (!fitA || !fitB) {
            return 0;
        }

        const byWords = fitB.wordsFound - fitA.wordsFound;
        return byWords || (fitA.namesEveryTerm && fitB.namesEveryTerm ? fitA.nameWordsLeftOut - fitB.nameWordsLeftOut : 0);
    };
    const reordered = [...leaders].sort(compare);

    const [first] = reordered;
    const tiedCount = first ? reordered.filter((leader) => compare(first, leader) === 0).length : 0;

    return { scored: [...reordered, ...scored.slice(leaders.length)], lead: tiedCount > 1 ? 'tied' : 'tie_broken', tiedCount };
}

function sameScore(a: number, b: number): boolean {
    return Math.abs(a - b) < 1e-9;
}

function singular(word: string): string {
    return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/**
 * Unmatched query words can give even a well-fitting top tool a high score, so the line follows the
 * top result: a margin behind it when it scores within LEADING_MATCH_SCORE, never stricter than
 * BEST_MATCH_SCORE, and BEST_MATCH_SCORE alone otherwise. Lower scores are better.
 */
function bestMatchScoreFor(topScore: number | undefined): number {
    if (topScore === undefined || topScore > LEADING_MATCH_SCORE) {
        return BEST_MATCH_SCORE;
    }

    return Math.max(BEST_MATCH_SCORE, topScore + LEADING_MATCH_MARGIN);
}

/**
 * A related tool is listed once per call, under the closest query that still has room, and not at
 * all when another query returns it as a match. A query keeps at most MAX_RELATED_WITH_MATCH related
 * tools when it has a match, and MAX_RELATED_WITHOUT_MATCH otherwise. Matches are never trimmed, so
 * every query keeps its own answer.
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
 * Each word is fuzzy matched on its own against the tool's action, description, integration and
 * provider, because Fuse matches a query as one pattern and a sentence then matches nothing. A
 * tool's score is the share of words it fails to answer, from 0 (all) to 1 (none), and a tool
 * above MAX_MATCH_SCORE is dropped.
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

// Stopwords are dropped, unless nothing else is left: a query like 'how to' is searched as written.
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
            // Defensive: a tool the listing has no slug for cannot be called.
            const slug = slugOf({ integration, action: tool.name });
            const tags = clientToolTags(tool.tags);

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
                          ...(tags ? { tags } : {}),
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
    const meta = candidate.tags ? { _meta: { [TAGS_META_KEY]: candidate.tags } } : {};
    if (input.kind !== 'schema') {
        return { ...toRelated(candidate), input, ...meta };
    }

    const schema = { ...input.schema };
    delete schema.$schema;
    return { ...toRelated(candidate), input: { kind: 'schema', schema }, ...meta };
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
        lines.push('No close match, only related tools.');
    } else if (tied) {
        lines.push('These matches fit the query equally well. Pick the one whose description fits the task.');
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
