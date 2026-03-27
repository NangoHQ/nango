import { getLogger } from '@nangohq/utils';

import type { Request, Response } from 'express';

const logger = getLogger('agentProxy');

const AGENT_URL = process.env['AGENT_URL'] || '';
const AGENT_API_KEY = process.env['AGENT_API_KEY'] || '';

function agentHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AGENT_API_KEY}`
    };
}

export async function postAgentBuild(req: Request, res: Response): Promise<void> {
    if (!AGENT_URL) {
        res.status(503).json({ error: 'Agent not configured' });
        return;
    }

    logger.info(`[build] → ${AGENT_URL}/build`);
    const upstream = await fetch(`${AGENT_URL}/build`, {
        method: 'POST',
        headers: agentHeaders(),
        body: JSON.stringify(req.body)
    });

    logger.info(`[build] ← ${upstream.status}`);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
}

export async function getAgentSessionEvents(req: Request, res: Response): Promise<void> {
    if (!AGENT_URL) {
        res.status(503).json({ error: 'Agent not configured' });
        return;
    }

    const { sid } = req.params;
    const upstream = await fetch(`${AGENT_URL}/session/${sid}/events`, {
        headers: { Authorization: `Bearer ${AGENT_API_KEY}` },
        signal: req.socket.destroyed ? AbortSignal.abort() : null
    });

    if (!upstream.ok || !upstream.body) {
        res.status(upstream.status).json({ error: 'Failed to connect to agent event stream' });
        return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    req.on('close', () => upstream.body!.cancel());

    const reader = upstream.body.getReader();
    const pump = async () => {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
        }
        res.end();
    };

    pump().catch(() => res.end());
}

export async function postAgentSessionAnswer(req: Request, res: Response): Promise<void> {
    if (!AGENT_URL) {
        res.status(503).json({ error: 'Agent not configured' });
        return;
    }

    const { sid } = req.params;
    const upstream = await fetch(`${AGENT_URL}/session/${sid}/answer`, {
        method: 'POST',
        headers: agentHeaders(),
        body: JSON.stringify(req.body)
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
}
