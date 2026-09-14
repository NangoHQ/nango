import { beforeAll, describe, expect, it } from 'vitest';

import { multipleMigrations } from '@nangohq/database';
import { accountService, userService } from '@nangohq/shared';
import { nanoid } from '@nangohq/utils';

import { oauthSubjectExists } from './subject.service.js';

describe('OAuth subjects', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    it('resolves Nango users rather than account ids and excludes suspended users', async () => {
        const value = nanoid();
        const account = await accountService.createAccount({ name: `OAuth account ${value}`, email: `owner-${value}@example.com` });
        if (!account) throw new Error('Failed to create OAuth test account');
        const user = await userService.createUser({
            name: 'OAuth user',
            email: `user-${value}@example.com`,
            account_id: account.id,
            email_verified: true,
            role: 'administrator'
        });
        if (!user) throw new Error('Failed to create OAuth test user');

        await expect(oauthSubjectExists(String(user.id))).resolves.toBe(true);
        await expect(oauthSubjectExists('not-a-user-id')).resolves.toBe(false);

        await userService.update({ id: user.id, suspended: true });
        await expect(oauthSubjectExists(String(user.id))).resolves.toBe(false);
    });
});
