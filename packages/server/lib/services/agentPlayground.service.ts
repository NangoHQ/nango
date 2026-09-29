import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { dynamicTool, generateText, jsonSchema, stepCountIs } from 'ai';

import db from '@nangohq/database';
import { connectionService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { createAgentSessionMcpServer } from '../controllers/agent/mcp/sessionServer.js';
import { createPlaygroundModel } from './agentPlaygroundModel.service.js';
import * as agentSessionService from './agentSession.service.js';
import * as agentSessionCreationService from './agentSessionCreation.service.js';

import type { ModelCallStats } from './agentPlaygroundModel.service.js';
import type { AgentPlaygroundToolCall, AgentPlaygroundUsage, AgentSession, AgentSessionPinnedConnection, DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { JSONSchema7, LanguageModel, ModelMessage, ToolSet } from 'ai';

const SESSION_EXPIRES_IN_MS = 60 * 60 * 1000;
const MAX_STEPS = 10;

const INSTRUCTIONS = `You are the Nango Agent Playground assistant. You act on the user's connected apps through the Nango tools you are given.
Use nango_tool_search to find a tool for what the user asks, then call it (directly, or through nango_execute).
Report what the tools returned plainly and do not invent data. If no tool fits or a call fails, say so.`;

// Rounded to the hour: the instructions are part of the model cache key.
export function buildInstructions(timeZone: string, now: Date): string {
    const local = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        hourCycle: 'h23'
    }).format(now);

    return `${INSTRUCTIONS}\nThe user's time zone is ${timeZone}. It is currently ${local}:00 there.`;
}

export interface PlaygroundContext {
    account: DBTeam;
    environment: DBEnvironment;
    plan: DBPlan | null;
}

export interface PlaygroundTurn {
    sessionId: string;
    messages: ModelMessage[];
    reply: string;
    toolCalls: AgentPlaygroundToolCall[];
    usage: AgentPlaygroundUsage;
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

export function pinNewestConnectionPerIntegration(
    rows: { connection: { provider_config_key: string; connection_id: string } }[]
): AgentSessionPinnedConnection[] {
    const pinned = new Map<string, AgentSessionPinnedConnection>();
    for (const { connection } of rows) {
        if (!pinned.has(connection.provider_config_key)) {
            pinned.set(connection.provider_config_key, { integrationId: connection.provider_config_key, connectionId: connection.connection_id });
        }
    }
    return [...pinned.values()];
}

async function getOrCreateSession(ctx: PlaygroundContext, sessionId: string | undefined): Promise<Result<AgentSession, AgentPlaygroundError>> {
    if (sessionId) {
        const existing = await agentSessionService.getAgentSession(db.knex, { id: sessionId, accountId: ctx.account.id, environmentId: ctx.environment.id });
        if (existing.isOk() && !existing.value.endedAt && existing.value.expiresAt > new Date()) {
            return Ok(existing.value);
        }
    }

    const rows = await connectionService.listConnections({ environmentId: ctx.environment.id });
    const created = await agentSessionCreationService.createAgentSession({
        account: ctx.account,
        environment: ctx.environment,
        connections: { any: [], pinned: pinNewestConnectionPerIntegration(rows) },
        toolset: undefined,
        pinnedTools: undefined,
        metaTools: undefined,
        expiresInMs: SESSION_EXPIRES_IN_MS
    });

    if (created.isErr()) {
        return Err(new AgentPlaygroundError('session_creation_failed', created.error.message, { cause: created.error }));
    }
    return Ok(created.value.session);
}

export async function buildMcpTools(client: Client, toolCalls: AgentPlaygroundToolCall[]): Promise<ToolSet> {
    const { tools } = await client.listTools();

    return Object.fromEntries(
        tools.map((mcpTool) => {
            const { $schema: _schema, ...inputSchema } = mcpTool.inputSchema;

            return [
                mcpTool.name,
                dynamicTool({
                    description: mcpTool.description ?? '',
                    inputSchema: jsonSchema(inputSchema as JSONSchema7),
                    execute: async (input, { toolCallId }) => {
                        const startedAt = Date.now();
                        const result = await client.callTool({ name: mcpTool.name, arguments: input as Record<string, unknown> });
                        const output = result.structuredContent ?? parseTextContent(result.content);

                        toolCalls.push({
                            id: toolCallId,
                            name: mcpTool.name,
                            input,
                            output,
                            isError: result.isError === true,
                            durationMs: Date.now() - startedAt
                        });
                        return output;
                    }
                })
            ];
        })
    );
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

export async function runTurn({
    ctx,
    sessionId,
    history,
    prompt,
    timeZone,
    model
}: {
    ctx: PlaygroundContext;
    sessionId: string | undefined;
    history: ModelMessage[];
    prompt: string;
    timeZone: string;
    model?: (stats: ModelCallStats) => LanguageModel;
}): Promise<Result<PlaygroundTurn, AgentPlaygroundError>> {
    const session = await getOrCreateSession(ctx, sessionId);
    if (session.isErr()) {
        return Err(session.error);
    }

    const server = createAgentSessionMcpServer({ account: ctx.account, environment: ctx.environment, plan: ctx.plan, session: session.value });
    const client = new Client({ name: 'nango-agent-playground', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);

        const toolCalls: AgentPlaygroundToolCall[] = [];
        const stats: ModelCallStats = { modelCalls: 0, cachedModelCalls: 0 };
        const userMessage: ModelMessage = { role: 'user', content: prompt };

        let result;
        try {
            result = await generateText({
                model: (model ?? createPlaygroundModel)(stats),
                instructions: buildInstructions(timeZone, new Date()),
                messages: [...history, userMessage],
                tools: await buildMcpTools(client, toolCalls),
                stopWhen: stepCountIs(MAX_STEPS)
            });
        } catch (err) {
            return Err(new AgentPlaygroundError('model_error', err instanceof Error ? err.message : 'The model call failed', { cause: err }));
        }

        return Ok({
            sessionId: session.value.id,
            messages: [userMessage, ...result.responseMessages],
            reply: result.text,
            toolCalls,
            usage: {
                inputTokens: result.totalUsage.inputTokens ?? 0,
                outputTokens: result.totalUsage.outputTokens ?? 0,
                modelCalls: stats.modelCalls,
                cachedModelCalls: stats.cachedModelCalls
            }
        });
    } finally {
        await client.close();
        await server.close();
    }
}
