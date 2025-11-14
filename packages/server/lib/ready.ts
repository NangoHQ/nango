import db from '@nangohq/database';

import { asyncWrapper } from './utils/asyncWrapper.js';

const state = {
    isReady: false,
    isShuttingDown: false
};

async function isReady(): Promise<boolean> {
    // Once shutdown has begun, always report unready.
    if (state.isShuttingDown) {
        return false;
    }

    // Check database connectivity once at startup.
    // After the first successful check, assume continued readiness
    // and ignore transient DB or network issues.
    if (!state.isReady) {
        try {
            const res = await db.knex.raw('SELECT 1');
            state.isReady = res.rowCount === 1;
        } catch {
            return false;
        }
    }

    return state.isReady;
}

export function beginShutdown(): void {
    state.isShuttingDown = true;
    state.isReady = false;
}

export const getReady = asyncWrapper<any, any>(async (_, res) => {
    if (await isReady()) {
        res.status(200).send({ result: 'ok' });
        return;
    }
    res.status(503).send({ result: 'not ready' });
});
