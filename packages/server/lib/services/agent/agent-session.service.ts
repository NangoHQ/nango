import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import { getLogger } from '@nangohq/utils';

import { createAgentPrompt, createAgentSandbox, createAnswerPrompt, createSessionTitle, destroyAgentSandbox } from '../daytona/agent-sandbox.service.js';

import type { AgentSandboxHandle } from '../daytona/agent-sandbox.service.js';
import type { Event as OpenCodeEvent, Message, Permission } from '@opencode-ai/sdk';

const logger = getLogger('agent-session-service');

type AgentBrowserEvent = {
    id: number;
    event: string;
    data: Record<string, unknown>;
};

interface AgentSessionRecord {
    sid: string;
    sandbox: AgentSandboxHandle;
    opencodeSessionId: string;
    model: {
        providerID: string;
        modelID: string;
        full: string;
    };
    emitter: EventEmitter;
    backlog: AgentBrowserEvent[];
    nextEventId: number;
    pendingPermissions: Map<string, Permission>;
}

class AgentSessionService {
    private readonly sessions = new Map<string, AgentSessionRecord>();

    public async createBuild(payload: Record<string, unknown>): Promise<{ sid: string; sandboxId: string; sessionId: string; eventsPath: string }> {
        const sid = randomUUID();
        const sandbox = await createAgentSandbox(sid, payload);

        try {
            const created = await sandbox.client.session.create({ body: { title: createSessionTitle(payload) } });
            const session = created.data;
            if (!session) {
                throw new Error('OpenCode did not return a session');
            }
            const record: AgentSessionRecord = {
                sid,
                sandbox,
                opencodeSessionId: session.id,
                model: sandbox.model,
                emitter: new EventEmitter(),
                backlog: [],
                nextEventId: 1,
                pendingPermissions: new Map()
            };

            this.sessions.set(sid, record);
            await this.startEventPump(record);

            this.emit(record, 'agent.session.started', {
                sid,
                sandboxId: sandbox.sandbox.id,
                sessionId: session.id,
                previewUrl: sandbox.previewUrl
            });

            await sandbox.client.session.promptAsync({
                path: { id: session.id },
                body: {
                    model: {
                        providerID: record.model.providerID,
                        modelID: record.model.modelID
                    },
                    parts: [{ type: 'text', text: createAgentPrompt(payload) }]
                }
            });

            this.emit(record, 'agent.prompt.accepted', { sid, sessionId: session.id });

            return {
                sid,
                sandboxId: sandbox.sandbox.id,
                sessionId: session.id,
                eventsPath: `/api/v1/agent/session/${sid}/events`
            };
        } catch (error) {
            await destroyAgentSandbox(sandbox);
            throw error;
        }
    }

    public getSession(sid: string): AgentSessionRecord | null {
        return this.sessions.get(sid) || null;
    }

    public subscribe(sid: string, listener: (event: AgentBrowserEvent) => void): { backlog: AgentBrowserEvent[]; unsubscribe: () => void } {
        const record = this.sessions.get(sid);
        if (!record) {
            throw new Error('Agent session not found');
        }

        record.emitter.on('event', listener);
        return {
            backlog: [...record.backlog],
            unsubscribe: () => record.emitter.off('event', listener)
        };
    }

    public async answer(sid: string, body: Record<string, unknown>): Promise<{ ok: true; kind: 'message' | 'permission' }> {
        const record = this.sessions.get(sid);
        if (!record) {
            throw new Error('Agent session not found');
        }

        const decision = typeof body['decision'] === 'string' ? body['decision'] : typeof body['response'] === 'string' ? body['response'] : null;
        const text = typeof body['text'] === 'string' ? body['text'] : typeof body['answer'] === 'string' ? body['answer'] : null;
        const inferredDecision = inferPermissionDecision(text);
        const effectiveDecision = decision === 'once' || decision === 'always' || decision === 'reject' ? decision : inferredDecision;

        if (effectiveDecision) {
            const permissionId = this.resolvePermissionId(record, body);
            await record.sandbox.client.postSessionIdPermissionsPermissionId({
                path: { id: record.opencodeSessionId, permissionID: permissionId },
                body: { response: effectiveDecision }
            });
            record.pendingPermissions.delete(permissionId);
            this.emit(record, 'agent.permission.submitted', { sid, permissionId, response: effectiveDecision });
            return { ok: true, kind: 'permission' };
        }

        if (!text || text.trim().length === 0) {
            throw new Error('Expected either a permission decision or a non-empty text answer');
        }

        await record.sandbox.client.session.promptAsync({
            path: { id: record.opencodeSessionId },
            body: {
                model: {
                    providerID: record.model.providerID,
                    modelID: record.model.modelID
                },
                parts: [{ type: 'text', text: createAnswerPrompt(text.trim()) }]
            }
        });
        this.emit(record, 'agent.answer.accepted', { sid });
        return { ok: true, kind: 'message' };
    }

    private resolvePermissionId(record: AgentSessionRecord, body: Record<string, unknown>): string {
        const explicit = typeof body['permissionId'] === 'string' ? body['permissionId'] : null;
        if (explicit && record.pendingPermissions.has(explicit)) {
            return explicit;
        }

        if (record.pendingPermissions.size === 1) {
            return [...record.pendingPermissions.keys()][0] as string;
        }

        throw new Error('Permission decision requires a valid permissionId');
    }

    private async startEventPump(record: AgentSessionRecord): Promise<void> {
        const subscription = await record.sandbox.client.event.subscribe();
        void (async () => {
            try {
                for await (const event of subscription.stream) {
                    this.handleOpenCodeEvent(record, event as OpenCodeEvent);
                }
            } catch (error) {
                logger.error('OpenCode event stream failed', { sid: record.sid, error });
                this.emit(record, 'agent.error', {
                    sid: record.sid,
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        })();
    }

    private handleOpenCodeEvent(record: AgentSessionRecord, event: OpenCodeEvent): void {
        switch (event.type) {
            case 'message.part.updated': {
                const part = event.properties.part;
                if (part.sessionID !== record.opencodeSessionId) {
                    return;
                }

                if (part.type === 'text') {
                    this.emit(record, 'agent.delta', {
                        sid: record.sid,
                        sessionId: record.opencodeSessionId,
                        messageId: part.messageID,
                        delta: event.properties.delta ?? part.text
                    });
                    return;
                }

                if (part.type === 'tool') {
                    this.emit(record, 'agent.tool.updated', {
                        sid: record.sid,
                        sessionId: record.opencodeSessionId,
                        messageId: part.messageID,
                        tool: part.tool,
                        state: part.state
                    });
                }
                return;
            }
            case 'message.updated': {
                const info = event.properties.info as Message;
                if (info.sessionID !== record.opencodeSessionId) {
                    return;
                }

                this.emit(record, 'agent.message.updated', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    message: info
                });
                return;
            }
            case 'permission.updated': {
                const permission = event.properties;
                if (permission.sessionID !== record.opencodeSessionId) {
                    return;
                }
                record.pendingPermissions.set(permission.id, permission);
                this.emit(record, 'agent.permission.requested', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    permission
                });
                return;
            }
            case 'permission.replied': {
                if (event.properties.sessionID !== record.opencodeSessionId) {
                    return;
                }
                record.pendingPermissions.delete(event.properties.permissionID);
                this.emit(record, 'agent.permission.replied', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    permissionId: event.properties.permissionID,
                    response: event.properties.response
                });
                return;
            }
            case 'session.status': {
                if (event.properties.sessionID !== record.opencodeSessionId) {
                    return;
                }
                this.emit(record, 'agent.session.status', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    status: event.properties.status
                });
                return;
            }
            case 'session.idle': {
                if (event.properties.sessionID !== record.opencodeSessionId) {
                    return;
                }
                this.emit(record, 'agent.session.idle', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId
                });
                return;
            }
            case 'session.error': {
                if (event.properties.sessionID && event.properties.sessionID !== record.opencodeSessionId) {
                    return;
                }
                this.emit(record, 'agent.error', {
                    sid: record.sid,
                    sessionId: record.opencodeSessionId,
                    error: event.properties.error
                });
                return;
            }
            default:
                return;
        }
    }

    private emit(record: AgentSessionRecord, event: string, data: Record<string, unknown>): void {
        const payload: AgentBrowserEvent = {
            id: record.nextEventId,
            event,
            data
        };
        record.nextEventId += 1;
        record.backlog.push(payload);
        if (record.backlog.length > 200) {
            record.backlog.shift();
        }
        record.emitter.emit('event', payload);
    }
}

export const agentSessionService = new AgentSessionService();

function inferPermissionDecision(text: string | null): 'once' | 'always' | 'reject' | null {
    if (!text) {
        return null;
    }

    const normalized = text.trim().toLowerCase();
    if (normalized === 'once' || normalized === 'allow once') {
        return 'once';
    }
    if (normalized === 'always' || normalized === 'allow always') {
        return 'always';
    }
    if (normalized === 'reject' || normalized === 'deny' || normalized === 'no') {
        return 'reject';
    }

    return null;
}
