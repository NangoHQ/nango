import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { convertToModelMessages, dynamicTool, jsonSchema, stepCountIs, streamText, toUIMessageStream } from 'ai';

import db from '@nangohq/database';
import { buildTagsFromEndUser, configService, connectionService, getProvider, getProviders, sharedCredentialsService } from '@nangohq/shared';
import { Err, getLogger, metrics, nanoid, Ok, report, stringifyError } from '@nangohq/utils';

import { createAgentSessionMcpServer } from '../controllers/agent/mcp/sessionServer.js';
import { postAgentSessionsBodySchema } from '../controllers/agent/postSessions.js';
import { recordIntegrationCreated } from '../hooks/auditIntegration.js';
import { getOrchestrator } from '../utils/utils.js';
import { buildInstructions } from './agentPlayground.instructions.js';
import { createPlaygroundModel } from './agentPlaygroundModel.service.js';
import { modelErrorCategory, modelUnavailableError } from './agentPlaygroundModelError.js';
import { labelFirstMessage } from './agentPlaygroundRequest.js';
import { SET_UP_INTEGRATIONS_TOOL, setUpIntegrationsTool, stopAfterSetUp } from './agentPlaygroundSetUpTool.js';
import { PLAYGROUND_USER_TAG_KEY, sessionOwner } from './agentPlaygroundTags.js';
import { isUsableOutcome, trackIntegrationSetup, trackPlaygroundTurn } from './agentPlaygroundUsage.service.js';
import * as agentSessionService from './agentSession.service.js';
import { trackAgentSessionCreated } from './agentSessionAnalytics.service.js';
import { withConnectionsCreatedInSession } from './agentSessionConnections.service.js';
import * as agentSessionCreationService from './agentSessionCreation.service.js';
import { TOOL_NAME_SEPARATOR } from './agentSessionToolCatalog.service/index.js';
import { getInstantSetup, needsSetupFields } from './instantSetup.js';
import integrationService from './integration.service.js';

import type { ModelErrorCategory } from './agentPlaygroundModelError.js';
import type { PlaygroundRequest } from './agentPlaygroundRequest.js';
import type { CatalogEntry } from './agentPlaygroundSetUpTool.js';
import type { PlaygroundStep, PlaygroundTurn, PlaygroundTurnOutcome } from './agentPlaygroundUsage.service.js';
import type { AuditAttribution } from '@nangohq/audit';
import type {
    AgentPlaygroundDataParts,
    AgentPlaygroundIntegrationSetup,
    AgentPlaygroundMessageMetadata,
    AgentPlaygroundSessionChange,
    AgentPlaygroundSessionCreated,
    AgentSession,
    AgentSessionPinnedConnection,
    DBEnvironment,
    DBPlan,
    DBTeam,
    DBUser,
    PostAgentSessionsBody,
    Provider,
    Tags
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { InferUIMessageChunk, JSONSchema7, ToolSet, UIMessage } from 'ai';

const logger = getLogger('AgentPlayground');

const MAX_STEPS = 10;

export const PLAYGROUND_PROVIDERS = ['google-calendar', 'google-mail', 'github', 'google-drive', 'linear', 'notion'];
// Older playground integrations carry this prefix, so keep matching it to reuse them.
const LEGACY_PLAYGROUND_PREFIX = 'pg-';

function providerCatalog(): CatalogEntry[] {
    return Object.entries(getProviders() ?? {}).map(([provider, properties]) => ({ provider, name: properties.display_name }));
}

export type PlaygroundUIMessage = UIMessage<AgentPlaygroundMessageMetadata, AgentPlaygroundDataParts>;
type PlaygroundChunk = InferUIMessageChunk<PlaygroundUIMessage>;

export interface PlaygroundContext {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    user: DBUser;
    auditAttribution?: AuditAttribution;
}

export class AgentPlaygroundError extends Error {
    constructor(
        public readonly code: 'session_creation_failed' | 'model_error',
        message: string,
        options?: { cause?: unknown }
    ) {
        super(message, options);
        this.name = 'AgentPlaygroundError';
    }
}

// A session pins one connection per integration, and a user can connect the same app more than once.
export function newestConnectionPerIntegration(
    connections: { connection: { provider_config_key: string; connection_id: string } }[]
): AgentSessionPinnedConnection[] {
    const pinned = new Map<string, AgentSessionPinnedConnection>();
    for (const { connection } of connections) {
        if (!pinned.has(connection.provider_config_key)) {
            pinned.set(connection.provider_config_key, { integrationId: connection.provider_config_key, connectionId: connection.connection_id });
        }
    }
    return [...pinned.values()];
}

// Expects `integrations` oldest first, as listProviderConfigs returns them.
export function existingIntegrationFor<T extends { unique_key: string; provider: string; missing_fields: string[] }>(
    integrations: T[],
    provider: string
): T | undefined {
    const matching = integrations.filter((integration) => integration.provider === provider);
    const pick = (candidates: T[]) =>
        candidates.find((integration) => integration.unique_key === provider) ??
        candidates.find((integration) => integration.unique_key === `${LEGACY_PLAYGROUND_PREFIX}${provider}`) ??
        candidates[0];
    return pick(matching.filter((integration) => integration.missing_fields.length === 0)) ?? pick(matching);
}

// The scope matches on `end_user_email`, so connections made here must carry it.
export function playgroundConnectionTags(user: Pick<DBUser, 'id' | 'uuid' | 'email' | 'name'>): Tags {
    return buildTagsFromEndUser(
        {
            id: String(user.id),
            email: user.email,
            display_name: user.name,
            tags: { origin: 'nango_agent_playground', [PLAYGROUND_USER_TAG_KEY]: user.uuid }
        },
        null
    );
}

function playgroundConnectionScope(user: Pick<DBUser, 'email'>): Tags {
    return { end_user_email: user.email };
}

export async function setUpPlaygroundIntegration(
    { environment, account, auditAttribution }: Pick<PlaygroundContext, 'environment' | 'account' | 'auditAttribution'>,
    providerName: string
): Promise<AgentPlaygroundIntegrationSetup> {
    const provider = getProvider(providerName);
    const base = { provider: providerName, ...(provider && { displayName: provider.display_name }) };

    // Read the primary: on a stale replica read, the create below adds a duplicate.
    const existing = existingIntegrationFor(await configService.listProviderConfigs(db.knex, environment.id), providerName);
    if (existing) {
        return { ...base, integrationId: existing.unique_key, outcome: existing.missing_fields.length > 0 ? 'missing_credentials' : 'existing' };
    }

    const sharedCredentials = await sharedCredentialsService.getLatestSharedCredentialsByName(providerName);
    if (sharedCredentials.isErr()) {
        logger.error(`Agent Playground could not load the ${providerName} OAuth app: ${sharedCredentials.error.message}`);
        return { ...base, outcome: 'not_created' };
    }
    if (!provider) {
        return { ...base, outcome: 'not_created' };
    }
    const instantSetup = getInstantSetup(provider, Boolean(sharedCredentials.value?.enabled));
    if (!instantSetup) {
        return { ...base, outcome: needsSetupFields(provider) ? 'needs_setup' : 'needs_developer_app' };
    }
    // Production integrations stay under the user's control, so the user adds them with one click on the card.
    if (environment.is_production) {
        return { ...base, outcome: 'needs_confirmation' };
    }

    const useSharedCredentials = instantSetup === 'nango-managed-app';
    const created = await createPlaygroundIntegration({ environment, account, providerName, provider, useSharedCredentials });
    if (!created) {
        return { ...base, outcome: 'not_created' };
    }
    if (created.inserted && auditAttribution) {
        await recordIntegrationCreated({
            integrationId: created.integrationId,
            displayName: provider.display_name,
            provider: providerName,
            account,
            environment,
            auditAttribution
        });
    }
    return { ...base, integrationId: created.integrationId, outcome: 'created', usesSharedCredentials: useSharedCredentials };
}

async function createPlaygroundIntegration({
    environment,
    account,
    providerName,
    provider,
    useSharedCredentials
}: Pick<PlaygroundContext, 'environment' | 'account'> & {
    providerName: string;
    provider: Provider;
    useSharedCredentials: boolean;
}): Promise<{ integrationId: string; inserted: boolean } | null> {
    const integrationId = providerName;
    const create = (uniqueKey: string) =>
        integrationService.create({
            environmentId: environment.id,
            provider: providerName,
            uniqueKey,
            credentialSource: useSharedCredentials ? 'nango' : 'own',
            displayName: provider.display_name,
            environment,
            team: account
        });
    let result = await create(integrationId);
    if (result.isErr()) {
        // A concurrent request that inserted the same key first makes this one fail on the unique constraint.
        const concurrent = existingIntegrationFor(await configService.listProviderConfigs(db.knex, environment.id), providerName);
        if (concurrent) {
            return { integrationId: concurrent.unique_key, inserted: false };
        }
        if (result.error.code === 'integration_exists') {
            result = await create(`${integrationId}-${nanoid(4).toLowerCase()}`);
        }
    }
    if (result.isErr()) {
        logger.error(`Agent Playground could not create the ${providerName} integration: ${result.error.message}`);
        return null;
    }
    const created = result.value.integration;
    if (created.unique_key === integrationId || !created.id) {
        return { integrationId: created.unique_key, inserted: true };
    }

    // Keep our own row in the list: concurrent requests must all pick the same winner, or each deletes its own.
    const winner = existingIntegrationFor(await configService.listProviderConfigs(db.knex, environment.id), providerName);
    if (!winner || winner.unique_key === created.unique_key) {
        return { integrationId: created.unique_key, inserted: true };
    }
    await configService.deleteProviderConfig({
        id: created.id,
        environmentId: environment.id,
        providerConfigKey: created.unique_key,
        orchestrator: getOrchestrator()
    });
    return { integrationId: winner.unique_key, inserted: false };
}

// A session fixes its toolset and pinned connections when created, so any change since then needs a new session.
export function sessionChange(
    session: Pick<AgentSession, 'compiledToolset' | 'resolvedConnections'>,
    integrationIds: string[],
    pinned: AgentSessionPinnedConnection[]
): AgentPlaygroundSessionChange | undefined {
    const sameIntegrations =
        Object.keys(session.compiledToolset).length === integrationIds.length &&
        integrationIds.every((integrationId) => Object.hasOwn(session.compiledToolset, integrationId));
    if (!sameIntegrations) {
        return 'integrations_changed';
    }
    const sameConnections =
        Object.keys(session.resolvedConnections).length === pinned.length &&
        pinned.every(({ integrationId, connectionId }) => session.resolvedConnections[integrationId]?.connectionId === connectionId);
    return sameConnections ? undefined : 'connections_changed';
}

export function playgroundSessionRequest({
    pinned,
    scope,
    connectionTags
}: {
    pinned: AgentSessionPinnedConnection[];
    scope: Tags;
    connectionTags: Tags;
}): PostAgentSessionsBody {
    // A tag selector fails as ambiguous once a user has two connections to one integration. Use it only while nothing is pinned.
    const connections =
        pinned.length > 0
            ? { pinned: pinned.map((pin) => ({ integration_id: pin.integrationId, connection_id: pin.connectionId })) }
            : { any: [{ tags: scope }] };
    return {
        // Connected or not, so the agent can offer to connect a missing app.
        toolset: '*',
        meta_tools: { nango_create_connection: { enabled: true, tags: connectionTags }, nango_proxy: true },
        expires_in: '1h',
        // Last, because the pinned list grows with the integrations.
        tenant: { connections }
    };
}

async function getOrCreateSession(
    ctx: PlaygroundContext,
    sessionId: string | undefined,
    integrationIds: string[],
    pinned: AgentSessionPinnedConnection[]
): Promise<Result<{ session: AgentSession; created?: AgentPlaygroundSessionCreated }, AgentPlaygroundError>> {
    let reason: AgentPlaygroundSessionCreated['reason'];
    const existing = sessionId
        ? await agentSessionService.getAgentSession(db.knex, { id: sessionId, accountId: ctx.account.id, environmentId: ctx.environment.id })
        : undefined;
    if (
        existing?.isOk() &&
        sessionOwner(existing.value) === ctx.user.uuid &&
        // Connections a session creates must stay in the user's scope, which follows their current email.
        existing.value.metaTools.nangoCreateConnection.tags['end_user_email'] === ctx.user.email
    ) {
        if (existing.value.endedReason === 'expired' || (!existing.value.endedAt && existing.value.expiresAt <= new Date())) {
            reason = 'expired';
        } else if (!existing.value.endedAt) {
            // Without this, connecting an app from the chat would replace the session the connection was made in.
            const current = await withConnectionsCreatedInSession(existing.value).catch((err: unknown) => {
                report(err);
                return existing.value;
            });
            reason = sessionChange(current, integrationIds, pinned);
            if (!reason) {
                return Ok({ session: current });
            }
        }
    }

    // This request is returned to the user as the one that created the session, so the session must be built from it.
    const request = playgroundSessionRequest({ pinned, scope: playgroundConnectionScope(ctx.user), connectionTags: playgroundConnectionTags(ctx.user) });
    // Converts the public body into createAgentSession's arguments, the same way the public POST /sessions does.
    const parsed = postAgentSessionsBodySchema.safeParse(request);
    if (!parsed.success) {
        return Err(new AgentPlaygroundError('session_creation_failed', parsed.error.message, { cause: parsed.error }));
    }
    const params = {
        account: ctx.account,
        environment: ctx.environment,
        plan: ctx.plan,
        connections: parsed.data.tenant.connections,
        toolset: parsed.data.toolset,
        pinnedTools: parsed.data.pinned_tools,
        metaTools: parsed.data.meta_tools?.metaTools,
        expiresInMs: parsed.data.expires_in
    };
    const created = await agentSessionCreationService.createAgentSession(params);

    if (created.isErr()) {
        return Err(new AgentPlaygroundError('session_creation_failed', created.error.message, { cause: created.error }));
    }
    trackAgentSessionCreated(created.value.session, params, request);
    return Ok({ session: created.value.session, created: { request, ...(reason ? { reason } : {}) } });
}

function withSessionPart(stream: ReadableStream<PlaygroundChunk>, created: AgentPlaygroundSessionCreated): ReadableStream<PlaygroundChunk> {
    return stream.pipeThrough(
        new TransformStream<PlaygroundChunk, PlaygroundChunk>({
            transform(chunk, controller) {
                controller.enqueue(chunk);
                if (chunk.type === 'start') {
                    controller.enqueue({ type: 'data-session', data: created });
                }
            }
        })
    );
}

function setupOnlyReply(messageMetadata: AgentPlaygroundMessageMetadata): ReadableStream<PlaygroundChunk> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue({ type: 'start', messageMetadata });
            controller.enqueue({ type: 'finish', finishReason: 'stop' });
            controller.close();
        }
    });
}

export async function buildMcpTools(client: Client): Promise<ToolSet> {
    const tools: Awaited<ReturnType<Client['listTools']>>['tools'] = [];
    let cursor: string | undefined;
    do {
        const page = await client.listTools(cursor ? { cursor } : undefined);
        tools.push(...page.tools);
        cursor = page.nextCursor;
    } while (cursor);

    return Object.fromEntries(
        tools.map((mcpTool) => {
            const { $schema: _schema, ...inputSchema } = mcpTool.inputSchema;

            return [
                mcpTool.name,
                dynamicTool({
                    description: mcpTool.description ?? '',
                    inputSchema: jsonSchema(inputSchema as JSONSchema7),
                    execute: async (input) => {
                        const result = await client.callTool({ name: mcpTool.name, arguments: input as Record<string, unknown> });
                        const output = result.structuredContent ?? parseTextContent(result.content);
                        if (result.isError) {
                            throw new Error(typeof output === 'string' ? output : JSON.stringify(output));
                        }
                        return output;
                    }
                })
            ];
        })
    );
}

// Actions carry no read-only flag, so anything not named like a read waits for the user.
const READ_ACTION = /^(list|get|search|fetch|find|read|lookup|query|retrieve|export|download|whoami)([-_]|$)/;

export function toolNeedsApproval(toolName: string, input: unknown): boolean {
    const args = (input ?? {}) as { method?: unknown; tool?: unknown };
    if (toolName === 'nango_proxy') {
        return typeof args.method !== 'string' || args.method.toUpperCase() !== 'GET';
    }

    const qualified = toolName === 'nango_execute' ? args.tool : toolName;
    if (typeof qualified !== 'string') {
        return toolName === 'nango_execute';
    }
    const separator = qualified.indexOf(TOOL_NAME_SEPARATOR);
    if (separator <= 0) {
        return false;
    }
    return !READ_ACTION.test(qualified.slice(separator + TOOL_NAME_SEPARATOR.length));
}

function parseTextContent(content: { type: string; text?: string }[]): unknown {
    const text = content
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n');
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function textOf(message: PlaygroundUIMessage | undefined): string {
    if (message?.role !== 'user') {
        return '';
    }
    return message.parts
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join(' ')
        .trim();
}

export function isEmptyReply(message: PlaygroundUIMessage): boolean {
    return message.role === 'assistant' && message.parts.every((part) => part.type.startsWith('data-'));
}

export function describeTurn(messages: PlaygroundUIMessage[], starterProvider: string | undefined): PlaygroundTurn {
    const isFirstTurn = !messages.some((message) => message.role === 'assistant' && !isEmptyReply(message));

    return {
        isFirstTurn,
        ...(starterProvider ? { starterProvider } : {})
    };
}

export async function startTurn({
    ctx,
    sessionId,
    chatId,
    messages,
    timeZone,
    abortSignal
}: {
    ctx: PlaygroundContext;
    sessionId: string | undefined;
    chatId?: string | undefined;
    messages: PlaygroundUIMessage[];
    timeZone: string;
    abortSignal?: AbortSignal;
}): Promise<Result<ReadableStream<PlaygroundChunk>, AgentPlaygroundError>> {
    const lastMessage = messages.at(-1);
    const requestedStarter = lastMessage?.role === 'user' ? lastMessage.metadata?.starterProvider : undefined;
    // The provider comes from the browser, so only the playground's own providers are set up or tracked.
    const starterProvider = requestedStarter && PLAYGROUND_PROVIDERS.includes(requestedStarter) ? requestedStarter : undefined;
    const integrationSetup = starterProvider ? await setUpPlaygroundIntegration(ctx, starterProvider) : undefined;
    if (integrationSetup) {
        trackIntegrationSetup(ctx, integrationSetup, 'starter');
    }
    if (integrationSetup && !isUsableOutcome(integrationSetup.outcome)) {
        return Ok(setupOnlyReply({ integrationSetup }));
    }

    let integrationIds: string[];
    let pinned: AgentSessionPinnedConnection[];
    try {
        // Read after the starter setup, so an integration it creates is part of the list.
        integrationIds = await configService.listIntegrationKeys(db.knex, ctx.environment.id);
        pinned = newestConnectionPerIntegration(
            await connectionService.listConnections({ environmentId: ctx.environment.id, integrationIds, tags: playgroundConnectionScope(ctx.user) })
        );
    } catch (err) {
        return Err(new AgentPlaygroundError('session_creation_failed', 'Could not read the integrations and connections', { cause: err }));
    }
    const sessionResult = await getOrCreateSession(ctx, sessionId, integrationIds, pinned);
    if (sessionResult.isErr()) {
        return Err(sessionResult.error);
    }
    const { session, created: sessionCreated } = sessionResult.value;
    const sessionMetadata = { sessionId: session.id };
    const startMetadata: AgentPlaygroundMessageMetadata = { ...sessionMetadata };
    if (integrationSetup) {
        startMetadata.integrationSetup = integrationSetup;
    }

    const server = createAgentSessionMcpServer({ account: ctx.account, environment: ctx.environment, plan: ctx.plan, session });
    const client = new Client({ name: 'nango-agent-playground', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    let closed = false;
    const close = async () => {
        if (closed) {
            return;
        }
        closed = true;
        await client.close();
        await server.close();
    };

    let tools: ToolSet;
    let modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
    try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        [tools, modelMessages] = await Promise.all([
            buildMcpTools(client),
            convertToModelMessages(
                // A setup-only reply, or a Stop before the first part, leaves an assistant message the model can't see. OpenAI rejects an empty turn.
                messages.filter((message) => !isEmptyReply(message)),
                // A tool call left unanswered by Stop or an ignored approval would make OpenAI reject every later turn.
                { ignoreIncompleteToolCalls: true }
            )
        ]);
    } catch (err) {
        await close();
        return Err(new AgentPlaygroundError('model_error', err instanceof Error ? err.message : 'The agent could not start', { cause: err }));
    }

    const steps: PlaygroundStep[] = [];
    let failed = false;
    let failedCategory: ModelErrorCategory | null = null;
    const turn = describeTurn(messages, starterProvider);
    const model = createPlaygroundModel();
    const typedText = turn.isFirstTurn && !turn.starterProvider ? textOf(lastMessage) : '';
    // Not given abortSignal, so a turn the user stops still gets labelled.
    const labelRequest: Promise<PlaygroundRequest | undefined> = typedText ? labelFirstMessage(model, typedText) : Promise.resolve(undefined);

    tools[SET_UP_INTEGRATIONS_TOOL] = setUpIntegrationsTool({
        catalog: providerCatalog(),
        setUp: async (provider) => {
            const setup = await setUpPlaygroundIntegration(ctx, provider);
            trackIntegrationSetup(ctx, setup, 'agent');
            return setup;
        }
    });

    const result = streamText({
        model,
        instructions: buildInstructions({
            timeZone,
            now: new Date(),
            sessionInstructions: client.getInstructions(),
            environmentName: ctx.environment.name
        }),
        messages: modelMessages,
        tools,
        stopWhen: [stepCountIs(MAX_STEPS), stopAfterSetUp],
        ...(abortSignal ? { abortSignal } : {}),
        toolApproval: ({ toolCall }) => (toolNeedsApproval(toolCall.toolName, toolCall.input) ? 'user-approval' : undefined),
        onStepEnd: (step) => {
            steps.push({ model: { modelId: step.model.modelId }, usage: step.usage });
        },
        onEnd: close,
        onAbort: close,
        onError: async ({ error }) => {
            failed = true;
            failedCategory = modelErrorCategory(error);
            if (failedCategory) {
                metrics.increment(metrics.Types.AGENT_PLAYGROUND_MODEL_ERROR, 1, { category: failedCategory });
            }
            logger.error(`Agent Playground turn failed (${failedCategory ?? 'not a provider error'}): ${stringifyError(error)}`);
            await close();
        }
    });

    const uiStream = toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        onError: (error) => {
            const category = modelErrorCategory(error);
            if (category) {
                return JSON.stringify(modelUnavailableError(category));
            }
            return error instanceof Error ? error.message : 'The agent failed to answer';
        },
        messageMetadata: ({ part }): AgentPlaygroundMessageMetadata | undefined => {
            if (part.type === 'start') {
                return startMetadata;
            }
            if (part.type === 'finish') {
                return { ...sessionMetadata, usage: { inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0 } };
            }
            return undefined;
        },
        // streamText's onEnd never runs when the request throws. Its onError runs before the failing step reports usage.
        onEnd: ({ isAborted, isCancelled, outcome }) => {
            let turnOutcome: PlaygroundTurnOutcome = 'complete';
            if (isAborted || isCancelled || outcome.status === 'aborted') {
                turnOutcome = 'aborted';
            } else if (failed || outcome.status === 'failed') {
                turnOutcome = 'error';
            }
            void labelRequest.then((labelled) => {
                trackPlaygroundTurn({
                    ctx,
                    sessionId: session.id,
                    chatId,
                    turn: labelled ? { ...turn, request: labelled } : turn,
                    outcome: turnOutcome,
                    steps,
                    errorCategory: failedCategory
                });
            });
        }
    });
    return Ok(sessionCreated ? withSessionPart(uiStream, sessionCreated) : uiStream);
}
