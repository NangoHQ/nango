import type { Request } from 'express';

const ACCOUNT_DISCOVERY_ONBOARDING_TTL_MS = 10 * 60 * 1000;

export async function setPendingAccountDiscovery(req: Request, userId: number): Promise<void> {
    req.session.pendingAccountDiscovery = {
        userId,
        expiresAt: Date.now() + ACCOUNT_DISCOVERY_ONBOARDING_TTL_MS
    };
    await saveSession(req);
}

export async function getPendingAccountDiscovery(req: Request, userId: number) {
    const discovery = req.session.pendingAccountDiscovery;
    if (!discovery || discovery.userId !== userId) {
        return null;
    }

    if (discovery.expiresAt <= Date.now()) {
        await clearPendingAccountDiscovery(req);
        return null;
    }

    return discovery;
}

export async function clearPendingAccountDiscovery(req: Request): Promise<void> {
    delete req.session.pendingAccountDiscovery;
    await saveSession(req);
}

export async function setDiscoveredAccountRecommendation(req: Request, recommendation: { accountId: number; accountName: string }): Promise<void> {
    const discovery = req.session.pendingAccountDiscovery;
    if (!discovery) {
        throw new Error('Cannot set an account discovery recommendation without a pending discovery session');
    }

    discovery.recommendation = recommendation;
    await saveSession(req);
}

async function saveSession(req: Request): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
            if (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
                return;
            }

            resolve();
        });
    });
}
