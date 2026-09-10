import { describe, expect, it } from 'vitest';

import { deployCatalogActions } from './integrationTemplate.service.js';

import type { Config } from '@nangohq/shared';
import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

const environment = { id: 1, account_id: 1 } as DBEnvironment;
const account = { id: 1, name: 'test' } as DBTeam;

describe('deployCatalogActions', () => {
    it('skips deploy when the plan is auto-idled past trial', async () => {
        const result = await deployCatalogActions({
            environment,
            account,
            plan: { auto_idle: true, trial_end_at: new Date(0) } as DBPlan,
            integration: { id: 1, unique_key: 'bitdefender', provider: 'bitdefender' } as Config
        });

        expect(result).toEqual({ ok: false, reason: 'plan_limit' });
    });

    it('is a no-op when the provider has no catalog actions', async () => {
        const result = await deployCatalogActions({
            environment,
            account,
            plan: null,
            integration: { id: 1, unique_key: 'google', provider: 'google' } as Config
        });

        expect(result).toEqual({ ok: true, deployed: [], skipped: [] });
    });
});
