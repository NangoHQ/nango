import type { Request } from 'express';

const ACCOUNT_DISCOVERY_ONBOARDING_TTL_MS = 60 * 60 * 1000;

export async function setAccountDiscoveryRecommendation(
    req: Request,
    userId: number,
    recommendation: { accountId: number; accountName: string }
): Promise<void> {
    req.session.pendingAccountDiscovery = {
        userId,
        expiresAt: Date.now() + ACCOUNT_DISCOVERY_ONBOARDING_TTL_MS,
        recommendation
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
