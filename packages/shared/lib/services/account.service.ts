import db from '@nangohq/database';
import { flagHasPlan, report } from '@nangohq/utils';

import environmentService from './environment.service.js';
import { LogActionEnum } from '../models/Telemetry.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { plansList } from './plans/definitions.js';
import { createPlan } from './plans/plans.js';

import type { Knex } from '@nangohq/database';
import type { DBEnvironment, DBTeam } from '@nangohq/types';

const freeEmailDomains = [
    'gmail.com',
    'duck.com',
    'anonaddy.me',
    'me.com',
    'hey.com',
    'icloud.com',
    'hotmail.com',
    'outlook.com',
    'aol.com',
    'yahoo.com',
    'gmx.com',
    'protonmail.com',
    'proton.me',
    'googlemail.com',
    'sina.com',
    'mail.com',
    'zoho.com',
    'zohomail.com',
    'fastmail.com',
    'tutanota.com',
    'tuta.io',
    'yandex.com',
    'yandex.ru',
    'inbox.com',
    'hushmail.com',
    'rediffmail.com',
    '163.com',
    '126.com',
    'yeah.net',
    'qq.com',
    'seznam.cz',
    'web.de',
    'mail.ru',
    'lycos.com',
    'excite.com',
    'rocketmail.com',
    'blueyonder.co.uk',
    'btinternet.com',
    'talktalk.net',
    'shaw.ca',
    'rogers.com',
    'sympatico.ca'
];

class AccountService {
    async getAccountById(trx: Knex, id: number): Promise<DBTeam | null> {
        try {
            const result = await trx.select('*').from<DBTeam>(`_nango_accounts`).where({ id: id }).first();
            return result || null;
        } catch (err) {
            errorManager.report(err, {
                source: ErrorSourceEnum.PLATFORM,
                operation: LogActionEnum.DATABASE,
                accountId: id
            });

            return null;
        }
    }

    async editAccount({ name, id }: { name: string; id: number }): Promise<void> {
        await db.knex.update({ name, updated_at: new Date() }).from<DBTeam>(`_nango_accounts`).where({ id });
    }

    async getAccountByUUID(uuid: string): Promise<DBTeam | null> {
        const result = await db.knex.select('*').from<DBTeam>(`_nango_accounts`).where({ uuid }).first();

        return result || null;
    }

    async getAccountAndEnvironmentIdByUUID(targetAccountUUID: string, targetEnvironment: string): Promise<{ accountId: number; environmentId: number } | null> {
        const account = await db.knex.select('id').from<DBTeam>(`_nango_accounts`).where({ uuid: targetAccountUUID });

        if (account == null || account.length == 0 || account[0] == null) {
            return null;
        }

        const accountId = account[0].id;

        const environment = await db.knex.select('id').from<DBEnvironment>(`_nango_environments`).where({
            account_id: accountId,
            name: targetEnvironment
        });

        if (environment == null || environment.length == 0 || environment[0] == null) {
            return null;
        }

        return { accountId, environmentId: environment[0].id };
    }

    async getUUIDFromAccountId(accountId: number): Promise<string | null> {
        const account = await db.knex.select('uuid').from<DBTeam>(`_nango_accounts`).where({ id: accountId });

        if (account == null || account.length == 0 || account[0] == null) {
            return null;
        }

        return account[0].uuid;
    }

    async getOrCreateAccount(name: string): Promise<DBTeam | null> {
        const account = await db.knex.select('*').from<DBTeam>(`_nango_accounts`).where({ name });

        if (account == null || account.length == 0 || !account[0]) {
            return await this.createAccount({ name });
        }

        return account[0];
    }

    /**
     * Create Account
     * @desc create a new account and assign to the default environments
     */
    async createAccount({ name, email, foundUs = '' }: { name: string; email?: string | undefined; foundUs?: string | undefined }): Promise<DBTeam | null> {
        // TODO: use transaction
        const emailTeamName = emailToTeamName({ email });
        const teamName = `${emailTeamName || name}'s Team`;
        const result = await db.knex.from<DBTeam>(`_nango_accounts`).insert({ name: teamName, found_us: foundUs }).returning('*');

        if (!result[0]) {
            return null;
        }

        await environmentService.createDefaultEnvironments(result[0].id);
        if (flagHasPlan) {
            const freePlan = plansList.find((plan) => plan.code === 'free');
            const res = await createPlan(db.knex, { account_id: result[0].id, name: 'free', ...freePlan?.flags });
            if (res.isErr()) {
                report(res.error);
            }
        }

        return result[0];
    }

    /**
     * Create Account without default environments
     * @desc create a new account and assign to the default environments
     */
    async createAccountWithoutEnvironments(name: string): Promise<DBTeam | null> {
        const result = await db.knex.from<DBTeam>(`_nango_accounts`).insert({ name }).returning('*');
        return result[0] || null;
    }
}

function emailToTeamName({ email }: { email?: string | undefined }): string | false {
    const parts = email?.split('@');
    const emailDomain = parts?.[parts.length - 1]?.toLowerCase();
    const domainName = emailDomain?.split('.').slice(0, -1).join('.');

    if (email && parts && parts.length >= 2 && emailDomain?.includes('.') && !freeEmailDomains.includes(emailDomain) && domainName) {
        return domainName.charAt(0).toUpperCase() + domainName.slice(1);
    }

    return false;
}

export { emailToTeamName };

export default new AccountService();
