import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { convertToModelMessages, dynamicTool, jsonSchema, stepCountIs, streamText, toUIMessageStream } from 'ai';

import db from '@nangohq/database';
import { configService, connectionService, getProvider, sharedCredentialsService } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { createAgentSessionMcpServer, TOOL_NAME_SEPARATOR } from '../controllers/agent/mcp/sessionServer.js';
import { getOrchestrator } from '../utils/utils.js';
import { buildInstructions } from './agentPlayground.instructions.js';
import { createPlaygroundModel } from './agentPlaygroundModel.service.js';
import * as agentSessionService from './agentSession.service.js';

import type {
    AgentPlaygroundIntegrationSetup,
    AgentPlaygroundMessageMetadata,
    AgentSession,
    AgentSessionPinnedConnection,
    DBEnvironment,
    DBPlan,
    DBTeam,
    DBUser
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JSONSchema7, LanguageModel, ToolSet, UIMessage, UIMessageChunk } from 'ai';

const logger = getLogger('AgentPlayground');

const PLAYGROUND_SESSION_EXPIRES_IN_MS = 60 * 60 * 1000;
const MAX_STEPS = 10;

export const PLAYGROUND_PROVIDERS = ['google-calendar', 'google-mail', 'github', 'slack', 'linear', 'hubspot'];
export const PLAYGROUND_INTEGRATION_PREFIX = 'pg-';

export function playgroundIntegrationId(provider: string): string {
    return `${PLAYGROUND_INTEGRATION_PREFIX}${provider}`;
}

export const PLAYGROUND_USER_TAG_KEY = 'nango/playground_user';

export type PlaygroundUIMessage = UIMessage<AgentPlaygroundMessageMetadata>;

export interface PlaygroundContext {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
    user: DBUser;
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
export function existingIntegrationFor<T extends { unique_key: string; provider: string }>(integrations: T[], provider: string): T | undefined {
    const matching = integrations.filter((integration) => integration.provider === provider);
    return (
        matching.find((integration) => integration.unique_key === playgroundIntegrationId(provider)) ??
        matching.find((integration) => integration.unique_key === provider) ??
        matching[0]
    );
}

// Never creates: only a pre-made prompt sets up a missing integration.
export async function resolvePlaygroundIntegrations(environment: DBEnvironment): Promise<string[]> {
    const existing = await configService.listProviderConfigs(db.knex, environment.id);
    return PLAYGROUND_PROVIDERS.flatMap((provider) => existingIntegrationFor(existing, provider)?.unique_key ?? []);
}

export async function setUpStarterIntegration(environment: DBEnvironment, providerName: string): Promise<AgentPlaygroundIntegrationSetup> {
    // Read the primary: on a stale replica read, the create below adds a duplicate.
    const existing = existingIntegrationFor(await configService.listProviderConfigs(db.knex, environment.id), providerName);
    if (existing) {
        return {
            provider: providerName,
            integrationId: existing.unique_key,
            outcome: existing.missing_fields.length > 0 ? 'missing_credentials' : 'existing'
        };
    }

    const created = await createWithNangoOAuthApp(environment, providerName);
    return created ? { provider: providerName, integrationId: created, outcome: 'created' } : { provider: providerName, outcome: 'not_created' };
}

async function createWithNangoOAuthApp(environment: DBEnvironment, providerName: string): Promise<string | null> {
    const provider = getProvider(providerName);
    const sharedCredentials = await sharedCredentialsService.getLatestSharedCredentialsByName(providerName);
    if (sharedCredentials.isErr()) {
        logger.error(`Agent Playground could not load the ${providerName} OAuth app: ${sharedCredentials.error.message}`);
        return null;
    }
    if (!provider || !sharedCredentials.value) {
        return null;
    }

    const integrationId = playgroundIntegrationId(providerName);
    const created = await sharedCredentialsService.createPreprovisionedProvider({
        providerName,
        environment_id: environment.id,
        provider,
        unique_key: integrationId,
        display_name: provider.display_name
    });
    if (created.isErr()) {
        logger.error(`Agent Playground could not create ${integrationId}: ${created.error.message}`);
        return null;
    }
    if (created.value.unique_key === integrationId || !created.value.id) {
        return created.value.unique_key;
    }

    // Keep our own row in the list: concurrent requests must all pick the same winner, or each deletes its own.
    const winner = existingIntegrationFor(await configService.listProviderConfigs(db.knex, environment.id), providerName);
    if (!winner || winner.unique_key === created.value.unique_key) {
        return created.value.unique_key;
    }
    await configService.deleteProviderConfig({
        id: created.value.id,
        environmentId: environment.id,
        providerConfigKey: created.value.unique_key,
        orchestrator: getOrchestrator()
    });
    return winner.unique_key;
}

// The owner is read from the create-connection tags, so those tags must stay per user.
export function sessionOwner(session: Pick<AgentSession, 'metaTools'>): string | undefined {
    return session.metaTools.nangoCreateConnection.tags[PLAYGROUND_USER_TAG_KEY];
}

async function getOrCreateSession(ctx: PlaygroundContext, sessionId: string | undefined): Promise<Result<AgentSession, AgentPlaygroundError>> {
    if (sessionId) {
        const existing = await agentSessionService.getAgentSession(db.knex, { id: sessionId, accountId: ctx.account.id, environmentId: ctx.environment.id });
        if (existing.isOk() && !existing.value.endedAt && existing.value.expiresAt > new Date() && sessionOwner(existing.value) === ctx.user.uuid) {
            return Ok(existing.value);
        }
    }

    const integrationIds = await resolvePlaygroundIntegrations(ctx.environment);
    const connections = await connectionService.listConnections({
        environmentId: ctx.environment.id,
        integrationIds,
        tags: { [PLAYGROUND_USER_TAG_KEY]: ctx.user.uuid }
    });

    const created = await agentSessionService.createAgentSession({
        account: ctx.account,
        environment: ctx.environment,
        connections: { any: [], pinned: newestConnectionPerIntegration(connections) },
        // Every playground integration, connected or not, so the agent can offer to connect a missing app.
        toolset: Object.fromEntries(integrationIds.map((integrationId) => [integrationId, { allow: '*', deny: [] }])),
        pinnedTools: undefined,
        metaTools: { nangoCreateConnection: { enabled: true, tags: { [PLAYGROUND_USER_TAG_KEY]: ctx.user.uuid } }, nangoProxy: true },
        expiresInMs: PLAYGROUND_SESSION_EXPIRES_IN_MS
    });

    if (created.isErr()) {
        return Err(new AgentPlaygroundError('session_creation_failed', created.error.message, { cause: created.error }));
    }
    return Ok(created.value.session);
}

// The page itself asks the user to finish the setup, so this reply has no text.
function setupOnlyReply(messageMetadata: AgentPlaygroundMessageMetadata): ReadableStream<UIMessageChunk<AgentPlaygroundMessageMetadata>> {
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

export async function startTurn({
    ctx,
    sessionId,
    messages,
    timeZone,
    abortSignal,
    model
}: {
    ctx: PlaygroundContext;
    sessionId: string | undefined;
    messages: PlaygroundUIMessage[];
    timeZone: string;
    abortSignal?: AbortSignal;
    model?: () => LanguageModel;
}): Promise<Result<ReadableStream<UIMessageChunk<AgentPlaygroundMessageMetadata>>, AgentPlaygroundError>> {
    const lastMessage = messages.at(-1);
    // The provider comes from the browser, so only the playground's own providers are set up.
    const starterProvider = lastMessage?.role === 'user' ? lastMessage.metadata?.starterProvider : undefined;
    const integrationSetup =
        starterProvider && PLAYGROUND_PROVIDERS.includes(starterProvider) ? await setUpStarterIntegration(ctx.environment, starterProvider) : undefined;
    // A new integration only reaches a session compiled after it exists.
    const session = await getOrCreateSession(ctx, integrationSetup ? undefined : sessionId);
    if (session.isErr()) {
        return Err(session.error);
    }
    const sessionMetadata = { sessionId: session.value.id, sessionExpiresAt: session.value.expiresAt.toISOString() };

    if (integrationSetup && integrationSetup.outcome !== 'created' && integrationSetup.outcome !== 'existing') {
        return Ok(setupOnlyReply({ ...sessionMetadata, integrationSetup }));
    }

    const server = createAgentSessionMcpServer({ account: ctx.account, environment: ctx.environment, plan: ctx.plan, session: session.value });
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
    let connected: Set<string>;
    try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        let connections: Awaited<ReturnType<typeof connectionService.listConnections>>;
        // Read live: the session's own connection list only fills in once a tool uses a connection.
        [tools, modelMessages, connections] = await Promise.all([
            buildMcpTools(client),
            convertToModelMessages(
                // A setup-only reply, or a Stop before the first part, leaves an assistant message with no parts. OpenAI rejects an empty turn.
                messages.filter((message) => message.role !== 'assistant' || message.parts.length > 0),
                // A tool call left unanswered by Stop or an ignored approval would make OpenAI reject every later turn.
                { ignoreIncompleteToolCalls: true }
            ),
            connectionService.listConnections({
                environmentId: ctx.environment.id,
                integrationIds: Object.keys(session.value.compiledToolset),
                tags: { [PLAYGROUND_USER_TAG_KEY]: ctx.user.uuid }
            })
        ]);
        connected = new Set(connections.map(({ connection }) => connection.provider_config_key));
    } catch (err) {
        await close();
        return Err(new AgentPlaygroundError('model_error', err instanceof Error ? err.message : 'The agent could not start', { cause: err }));
    }

    const result = streamText({
        model: (model ?? createPlaygroundModel)(),
        instructions: buildInstructions(
            timeZone,
            new Date(),
            Object.entries(session.value.compiledToolset).map(([id, integration]) => ({ id, provider: integration.provider, connected: connected.has(id) })),
            PLAYGROUND_PROVIDERS.filter(
                (provider) => !Object.values(session.value.compiledToolset).some((integration) => integration.provider === provider)
            ).map((provider) => getProvider(provider)?.display_name ?? provider)
        ),
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        ...(abortSignal ? { abortSignal } : {}),
        toolApproval: ({ toolCall }) => (toolNeedsApproval(toolCall.toolName, toolCall.input) ? 'user-approval' : undefined),
        onEnd: close,
        onAbort: close,
        onError: async ({ error }) => {
            logger.error(`Agent Playground turn failed: ${error instanceof Error ? error.message : String(error)}`);
            await close();
        }
    });

    return Ok(
        toUIMessageStream({
            stream: result.stream,
            originalMessages: messages,
            onError: (error) => (error instanceof Error ? error.message : 'The agent failed to answer'),
            messageMetadata: ({ part }): AgentPlaygroundMessageMetadata | undefined => {
                if (part.type === 'start') {
                    return { ...sessionMetadata, ...(integrationSetup ? { integrationSetup } : {}) };
                }
                if (part.type === 'finish') {
                    const usage = { inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0 };
                    logger.info(`Agent Playground turn: ${usage.inputTokens} in / ${usage.outputTokens} out tokens`);
                    return { ...sessionMetadata, usage };
                }
                return undefined;
            }
        })
    );
}
