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
import * as agentSessionCreationService from './agentSessionCreation.service.js';

import type { AgentPlaygroundMessageMetadata, AgentSession, AgentSessionPinnedConnection, DBEnvironment, DBPlan, DBTeam, DBUser } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JSONSchema7, LanguageModel, ToolSet, UIMessage, UIMessageChunk } from 'ai';

const logger = getLogger('AgentPlayground');

const PLAYGROUND_SESSION_EXPIRES_IN_MS = 60 * 60 * 1000;
const MAX_STEPS = 10;

export const PLAYGROUND_INTEGRATION_PREFIX = 'pg-';
export const PLAYGROUND_PROVIDERS: { provider: string; sharedCredentialsName?: string }[] = [
    { provider: 'google-calendar' },
    { provider: 'github', sharedCredentialsName: 'github-getting-started' }
];
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

export function playgroundIntegrationId(provider: string): string {
    return `${PLAYGROUND_INTEGRATION_PREFIX}${provider}`;
}

export async function ensurePlaygroundIntegrations(environment: DBEnvironment): Promise<string[]> {
    const ensured = await Promise.all(PLAYGROUND_PROVIDERS.map((entry) => ensurePlaygroundIntegration(environment, entry)));
    return ensured.filter((integrationId): integrationId is string => integrationId !== null);
}

async function ensurePlaygroundIntegration(
    environment: DBEnvironment,
    { provider: providerName, sharedCredentialsName }: (typeof PLAYGROUND_PROVIDERS)[number]
): Promise<string | null> {
    const integrationId = playgroundIntegrationId(providerName);
    const provider = getProvider(providerName);
    if (!provider) {
        logger.error(`Agent Playground provider ${providerName} does not exist`);
        return null;
    }

    // Read the primary: on a stale replica read, the create below adds a suffixed duplicate.
    if (await configService.getProviderConfig(integrationId, environment.id, db.knex)) {
        return integrationId;
    }

    const created = await sharedCredentialsService.createPreprovisionedProvider({
        providerName,
        ...(sharedCredentialsName ? { shared_credentials_name: sharedCredentialsName } : {}),
        environment_id: environment.id,
        provider,
        unique_key: integrationId,
        display_name: provider.display_name
    });
    if (created.isErr()) {
        logger.error(`Agent Playground could not create ${integrationId}: ${created.error.message}`);
        return null;
    }

    // A concurrent request created it first, so this one got a suffixed key.
    if (created.value.unique_key !== integrationId && created.value.id) {
        await configService.deleteProviderConfig({
            id: created.value.id,
            environmentId: environment.id,
            providerConfigKey: created.value.unique_key,
            orchestrator: getOrchestrator()
        });
    }
    return integrationId;
}

async function listUserConnections(ctx: PlaygroundContext, integrationIds: string[]) {
    if (integrationIds.length === 0) {
        return [];
    }
    return await connectionService.listConnections({
        environmentId: ctx.environment.id,
        integrationIds,
        tags: { [PLAYGROUND_USER_TAG_KEY]: ctx.user.uuid }
    });
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

    const integrationIds = await ensurePlaygroundIntegrations(ctx.environment);
    const connections = await listUserConnections(ctx, integrationIds);

    const created = await agentSessionCreationService.createAgentSession({
        account: ctx.account,
        environment: ctx.environment,
        connections: { any: [], pinned: newestConnectionPerIntegration(connections) },
        // Every playground integration, connected or not, so the agent can offer to connect a missing app.
        toolset: Object.fromEntries(integrationIds.map((integrationId) => [integrationId, { allow: '*', deny: [] }])),
        pinnedTools: undefined,
        metaTools: { nango_create_connection: { enabled: true, tags: { [PLAYGROUND_USER_TAG_KEY]: ctx.user.uuid } }, nango_proxy: { enabled: true } },
        expiresInMs: PLAYGROUND_SESSION_EXPIRES_IN_MS
    });

    if (created.isErr()) {
        return Err(new AgentPlaygroundError('session_creation_failed', created.error.message, { cause: created.error }));
    }
    return Ok(created.value.session);
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
const READ_ACTION = /^(list|get|search|fetch|find|read)-/;

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
    const session = await getOrCreateSession(ctx, sessionId);
    if (session.isErr()) {
        return Err(session.error);
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
        let connections: Awaited<ReturnType<typeof listUserConnections>>;
        // Read live: the session's own connection list only fills in once a tool uses a connection.
        [tools, modelMessages, connections] = await Promise.all([
            buildMcpTools(client),
            convertToModelMessages(messages),
            listUserConnections(ctx, Object.keys(session.value.compiledToolset))
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
            PLAYGROUND_PROVIDERS.filter(({ provider }) => !Object.hasOwn(session.value.compiledToolset, playgroundIntegrationId(provider))).map(
                ({ provider }) => getProvider(provider)?.display_name ?? provider
            )
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
                    return { sessionId: session.value.id };
                }
                if (part.type === 'finish') {
                    const usage = { inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0 };
                    logger.info(`Agent Playground turn: ${usage.inputTokens} in / ${usage.outputTokens} out tokens`);
                    return { sessionId: session.value.id, usage };
                }
                return undefined;
            }
        })
    );
}
