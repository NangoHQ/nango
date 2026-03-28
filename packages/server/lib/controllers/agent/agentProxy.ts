import { getLogger } from '@nangohq/utils';

import { agentSessionService } from '../../services/agent/agent-session.service.js';

import type { Request, Response } from 'express';

const logger = getLogger('agentProxy');

export async function postAgentBuild(req: Request, res: Response): Promise<void> {
    try {
        const session = await agentSessionService.createBuild(req.body as Record<string, unknown>);
        res.status(200).json({
            session_id: session.sid,
            sid: session.sid,
            sandbox_id: session.sandboxId,
            opencode_session_id: session.sessionId,
            events_path: session.eventsPath
        });
    } catch (error) {
        logger.error('Failed to start agent build', { error });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start agent build' });
    }
}

export async function getAgentSessionEvents(req: Request, res: Response): Promise<void> {
    const { sid } = req.params;
    if (!sid) {
        res.status(400).json({ error: 'Missing agent session id' });
        return;
    }

    try {
        if (!agentSessionService.getSession(sid)) {
            res.status(404).json({ error: 'Agent session not found' });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const writeEvent = (event: { id: number; event: string; data: Record<string, unknown> }) => {
            const mapped = mapAgentEventToUiEvent(event);
            if (!mapped) {
                return;
            }

            res.write(`id: ${event.id}\n`);
            res.write(`data: ${JSON.stringify(mapped)}\n\n`);
        };

        const subscription = agentSessionService.subscribe(sid, writeEvent);
        for (const event of subscription.backlog) {
            writeEvent(event);
        }

        const heartbeat = setInterval(() => {
            res.write(': heartbeat\n\n');
        }, 15000);

        req.on('close', () => {
            clearInterval(heartbeat);
            subscription.unsubscribe();
        });
    } catch (error) {
        logger.error('Failed to stream agent events', { sid, error });
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to connect to agent event stream' });
        } else {
            res.end();
        }
        return;
    }
}

export async function postAgentSessionAnswer(req: Request, res: Response): Promise<void> {
    const { sid } = req.params;
    if (!sid) {
        res.status(400).json({ error: 'Missing agent session id' });
        return;
    }
    try {
        const result = await agentSessionService.answer(sid, req.body as Record<string, unknown>);
        res.status(200).json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to answer agent session';
        const status = message === 'Agent session not found' ? 404 : 400;
        res.status(status).json({ error: message });
    }
}

function mapAgentEventToUiEvent(event: { event: string; data: Record<string, unknown> }): Record<string, unknown> | null {
    switch (event.event) {
        case 'agent.session.started': {
            const sid = typeof event.data['sid'] === 'string' ? event.data['sid'] : null;
            return sid ? { type: 'session', session_id: sid } : null;
        }
        case 'agent.delta': {
            const delta = typeof event.data['delta'] === 'string' ? event.data['delta'] : null;
            const sanitized = delta ? sanitizeAssistantDelta(delta) : null;
            if (!sanitized) {
                return null;
            }

            if (isDebugDelta(sanitized)) {
                return { type: 'debug', message: sanitized.trim() };
            }

            return { type: 'progress', message: sanitized };
        }
        case 'agent.tool.updated': {
            const tool = typeof event.data['tool'] === 'string' ? event.data['tool'] : 'tool';
            const state = event.data['state'];
            const status = typeof state === 'object' && state && 'status' in state && typeof state.status === 'string' ? state.status : 'updated';
            return { type: 'debug', message: `[tool] ${tool}: ${status}` };
        }
        case 'agent.message.updated': {
            const message = event.data['message'];
            if (!message || typeof message !== 'object') {
                return null;
            }

            const role = 'role' in message && typeof message.role === 'string' ? message.role : 'unknown';
            const id = 'id' in message && typeof message.id === 'string' ? message.id : 'unknown';
            const parts = 'parts' in message && Array.isArray(message.parts) ? message.parts.length : 0;
            return { type: 'debug', message: `[message] ${role} ${id} (${parts} part${parts === 1 ? '' : 's'})` };
        }
        case 'agent.session.status': {
            const status = typeof event.data['status'] === 'string' ? event.data['status'] : 'updated';
            return { type: 'debug', message: `[session] status: ${status}` };
        }
        case 'agent.permission.requested': {
            const permission = event.data['permission'];
            if (!permission || typeof permission !== 'object') {
                return null;
            }

            const permissionId = 'id' in permission && typeof permission.id === 'string' ? permission.id : null;
            const title = 'title' in permission && typeof permission.title === 'string' ? permission.title : 'Permission requested';
            const pattern = 'pattern' in permission ? permission.pattern : undefined;
            const patternText = Array.isArray(pattern) ? pattern.join(', ') : typeof pattern === 'string' ? pattern : '';

            return permissionId
                ? {
                      type: 'question',
                      question_id: permissionId,
                      message: `${title}${patternText ? ` (${patternText})` : ''}. Reply with once, always, or reject.`
                  }
                : null;
        }
        case 'agent.question': {
            const questionId = typeof event.data['questionId'] === 'string' ? event.data['questionId'] : null;
            const message = typeof event.data['message'] === 'string' ? event.data['message'] : null;
            return questionId && message
                ? {
                      type: 'question',
                      question_id: questionId,
                      message
                  }
                : null;
        }
        case 'agent.permission.submitted': {
            const response = typeof event.data['response'] === 'string' ? event.data['response'] : 'submitted';
            return { type: 'debug', message: `[permission] response sent: ${response}` };
        }
        case 'agent.permission.replied': {
            const response = typeof event.data['response'] === 'string' ? event.data['response'] : 'submitted';
            return { type: 'debug', message: `[permission] replied: ${response}` };
        }
        case 'agent.session.idle':
            return { type: 'done', message: 'Agent finished its current run.' };
        case 'agent.error': {
            const error = event.data['error'];
            const message =
                typeof event.data['message'] === 'string'
                    ? event.data['message']
                    : typeof error === 'object' &&
                        error &&
                        'data' in error &&
                        error.data &&
                        typeof error.data === 'object' &&
                        'message' in error.data &&
                        typeof error.data.message === 'string'
                      ? error.data.message
                      : 'Agent run failed';
            return { type: 'error', message };
        }
        default:
            return null;
    }
}

function isDebugDelta(delta: string): boolean {
    const trimmed = delta.trim();

    if (trimmed.includes('<system-reminder>') || trimmed.includes('</system-reminder>')) {
        return true;
    }

    if (trimmed.startsWith('Your operational mode has changed')) {
        return true;
    }

    return /^[a-z0-9_-]+:\s+(pending|running|completed|error)$/i.test(trimmed);
}

function sanitizeAssistantDelta(delta: string): string | null {
    const filtered = delta
        .split('\n')
        .filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                return false;
            }

            if (trimmed === '<system-reminder>' || trimmed === '</system-reminder>') {
                return false;
            }

            if (trimmed.startsWith('Your operational mode has changed')) {
                return false;
            }

            if (/^[a-z0-9_-]+:\s+(pending|running|completed|error)$/i.test(trimmed)) {
                return false;
            }

            if (/^[a-z0-9_-]+:\s+(pending|running|completed|error)<system-reminder>$/i.test(trimmed)) {
                return false;
            }

            return true;
        })
        .join('\n')
        .trim();

    return filtered.length > 0 ? filtered : null;
}
