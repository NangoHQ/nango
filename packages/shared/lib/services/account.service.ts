import db from '@nangohq/database';
import { flagHasPlan, isCloud, metrics, report } from '@nangohq/utils';

import environmentService, { hashSecretKey } from './environment.service.js';
import { LogActionEnum } from '../models/Telemetry.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { plansList } from './plans/definitions.js';
import { createPlan } from './plans/plans.js';
import encryptionManager from '../utils/encryption.manager.js';

import type { Knex } from '@nangohq/database';
import type { DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

const hashLocalCache = new Map<string, string>();

const freeEmailDomains = new Set([
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
]);

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
        metrics.increment(metrics.Types.ACCOUNT_CREATED, 1, { accountId: result[0].id });
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

    async getAccountFromEnvironment(environment_id: number): Promise<DBTeam | null> {
        const result = await db.knex
            .select<DBTeam>('_nango_accounts.*')
            .from('_nango_environments')
            .join('_nango_accounts', '_nango_accounts.id', '_nango_environments.account_id')
            .where('_nango_environments.id', environment_id)
            .first();

        return result || null;
    }

    async getAccountContextBySecretKey(secretKey: string): Promise<{ account: DBTeam; environment: DBEnvironment; plan: DBPlan | null } | null> {
        if (!isCloud) {
            const environmentVariables = Object.keys(process.env).filter((key) => key.startsWith('NANGO_SECRET_KEY_'));
            if (environmentVariables.length > 0) {
                for (const environmentVariable of environmentVariables) {
                    const envSecretKey = process.env[environmentVariable] as string;

                    if (envSecretKey !== secretKey) {
                        continue;
                    }

                    const envName = environmentVariable.replace('NANGO_SECRET_KEY_', '').toLowerCase();
                    // This key is set dynamically and does not exist in database
                    const env = await db.knex
                        .select<Pick<DBEnvironment, 'account_id'>>('account_id')
                        .from<DBEnvironment>('_nango_environments')
                        .where({ name: envName, deleted: false })
                        .first();

                    if (!env) {
                        return null;
                    }

                    return this.getAccountContext({ accountId: env.account_id, envName });
                }
            }
        }

        return this.getAccountContext({ secretKey });
    }

    async getAccountContextByPublicKey(publicKey: string): Promise<{ account: DBTeam; environment: DBEnvironment; plan: DBPlan | null } | null> {
        if (!isCloud) {
            const environmentVariables = Object.keys(process.env).filter((key) => key.startsWith('NANGO_PUBLIC_KEY_'));
            if (environmentVariables.length > 0) {
                for (const environmentVariable of environmentVariables) {
                    const envPublicKey = process.env[environmentVariable] as string;

                    if (envPublicKey !== publicKey) {
                        continue;
                    }
                    const envName = environmentVariable.replace('NANGO_PUBLIC_KEY_', '').toLowerCase();
                    // This key is set dynamically and does not exist in database
                    const env = await db.knex
                        .select<Pick<DBEnvironment, 'account_id'>>('account_id')
                        .from<DBEnvironment>('_nango_environments')
                        .where({ name: envName, deleted: false })
                        .first();
                    if (!env) {
                        return null;
                    }

                    return this.getAccountContext({ accountId: env.account_id, envName });
                }
            }
        }

        return this.getAccountContext({ publicKey });
    }

    async getAccountContext(
        // TODO: fix this union type that is not discriminated
        opts:
            | { publicKey: string }
            | { secretKey: string }
            | { accountId: number; envName: string }
            | { environmentId: number }
            | { environmentUuid: string }
            | { accountUuid: string; envName: string }
    ): Promise<{ account: DBTeam; environment: DBEnvironment; plan: DBPlan | null } | null> {
        const q = db.readOnly
            .select<{
                account: DBTeam;
                environment: DBEnvironment;
                plan: DBPlan | null;
            }>(
                db.knex.raw('row_to_json(_nango_environments.*) as environment'),
                db.knex.raw('row_to_json(_nango_accounts.*) as account'),
                db.knex.raw('row_to_json(plans.*) as plan')
            )
            .from<DBEnvironment>('_nango_environments')
            .join('_nango_accounts', '_nango_accounts.id', '_nango_environments.account_id')
            .leftJoin('plans', 'plans.account_id', '_nango_accounts.id')
            .where('_nango_environments.deleted', false)
            .first();

        let hash: string | undefined;
        if ('secretKey' in opts) {
            // Hashing is slow by design so it's very slow to recompute this hash all the time
            // We keep the hash in-memory to not compromise on security if the db leak
            hash = hashLocalCache.get(opts.secretKey) || (await hashSecretKey(opts.secretKey));
            q.where('secret_key_hashed', hash);
        } else if ('publicKey' in opts) {
            q.where('_nango_environments.public_key', opts.publicKey);
        } else if ('environmentUuid' in opts) {
            q.where('_nango_environments.uuid', opts.environmentUuid);
        } else if ('accountUuid' in opts) {
            q.where('_nango_accounts.uuid', opts.accountUuid).where('_nango_environments.name', opts.envName);
        } else if ('accountId' in opts) {
            q.where('_nango_environments.account_id', opts.accountId).where('_nango_environments.name', opts.envName);
        } else if ('environmentId' in opts) {
            q.where('_nango_environments.id', opts.environmentId);
        } else {
            return null;
        }

        const res = await q;
        if (!res) {
            return null;
        }

        if (hash && 'secretKey' in opts) {
            // store only successful attempt to not pollute the memory
            hashLocalCache.set(opts.secretKey, hash);
        }

        return {
            // getting data with row_to_json breaks the automatic string to date parser
            account: {
                ...res.account,
                created_at: new Date(res.account.created_at),
                updated_at: new Date(res.account.updated_at)
            },
            environment: {
                ...encryptionManager.decryptEnvironment(res.environment),
                created_at: new Date(res.environment.created_at),
                updated_at: new Date(res.environment.updated_at),
                deleted_at: res.environment.deleted_at ? new Date(res.environment.deleted_at) : res.environment.deleted_at
            },
            plan: res.plan
                ? {
                      ...res.plan,
                      created_at: new Date(res.plan.created_at),
                      updated_at: new Date(res.plan.updated_at),
                      trial_start_at: res.plan.trial_start_at ? new Date(res.plan.trial_start_at) : res.plan.trial_start_at,
                      trial_end_at: res.plan.trial_end_at ? new Date(res.plan.trial_end_at) : res.plan.trial_end_at,
                      trial_end_notified_at: res.plan.trial_end_notified_at ? new Date(res.plan.trial_end_notified_at) : res.plan.trial_end_notified_at,
                      orb_subscribed_at: res.plan.orb_subscribed_at ? new Date(res.plan.orb_subscribed_at) : res.plan.orb_subscribed_at,
                      orb_future_plan_at: res.plan.orb_future_plan_at ? new Date(res.plan.orb_future_plan_at) : res.plan.orb_future_plan_at
                  }
                : null
        };
    }
}

function emailToTeamName({ email }: { email?: string | undefined }): string | false {
    const parts = email?.split('@');
    const emailDomain = parts?.[parts.length - 1]?.toLowerCase();
    const domainParts = emailDomain?.split('.');

    if (!email || !parts || parts.length < 2 || !emailDomain?.includes('.') || freeEmailDomains.has(emailDomain) || !domainParts || domainParts.length < 2) {
        return false;
    }

    // Check if the domain has at least 3 parts and follows two-part TLD pattern
    // Common two-part TLDs follow the pattern: .{second-level}.{country-code}
    // Second-level domains are typically: co, com, net, org, edu, gov, ac, etc.
    // Country codes are typically 2-3 letters
    const secondToLastPart = domainParts[domainParts.length - 2];
    const lastPart = domainParts[domainParts.length - 1];

    // Create Sets for domain lookups
    const secondLevelDomains = new Set(['co', 'com', 'net', 'org', 'edu', 'gov', 'ac', 'mil', 'int']);
    const genericTLDs = new Set(['com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro', 'aero', 'coop', 'museum']);

    const hasTwoPartTLD =
        domainParts.length >= 3 &&
        secondToLastPart &&
        lastPart &&
        // Check if second-to-last part is a common second-level domain
        secondLevelDomains.has(secondToLastPart) &&
        // Check if last part is a country code (2-3 letters, not a generic TLD)
        lastPart.length >= 2 &&
        lastPart.length <= 3 &&
        !genericTLDs.has(lastPart);

    // Extract domain name excluding TLD(s)
    const domainName = hasTwoPartTLD
        ? domainParts.slice(0, -2).join('.') // Remove two parts for two-part TLDs
        : domainParts.slice(0, -1).join('.'); // Remove one part for single TLDs

    // Return false for invalid domains (e.g., .com, .co.uk)
    if (!domainName || domainName === '') {
        return false;
    }

    return domainName.charAt(0).toUpperCase() + domainName.slice(1);
}

export { emailToTeamName };

export default new AccountService();
