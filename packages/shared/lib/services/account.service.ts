import db from '@nangohq/database';
import { FixedSizeMap, flagHasPlan, isCloud, metrics, report } from '@nangohq/utils';

import environmentService from './environment.service.js';
import secretService from './secret.service.js';
import userService from './user.service.js';
import { LogActionEnum } from '../models/Telemetry.js';
import encryptionManager from '../utils/encryption.manager.js';
import errorManager, { ErrorSourceEnum } from '../utils/error.manager.js';
import { plansList } from './plans/definitions.js';
import { createPlan } from './plans/plans.js';

import type { Knex } from '@nangohq/database';
import type { DBAPISecret, DBEnvironment, DBPlan, DBTeam } from '@nangohq/types';

const hashLocalCache = new FixedSizeMap<string, string>(10_000);

interface AccountContext {
    account: DBTeam;
    environment: DBEnvironment;
    secret: DBAPISecret;
    plan: DBPlan | null;
    auth?: {
        source: 'customer_key' | 'api_secret';
        scopes?: string[];
        apiKeyId?: number;
    };
}

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

    async updateAccount({ id, name, foundUs }: { id: number; name?: string; foundUs?: string }): Promise<void> {
        const updates: Partial<DBTeam> & { updated_at: Date } = {
            ...(name !== undefined ? { name } : {}),
            ...(foundUs !== undefined ? { found_us: foundUs } : {}),
            updated_at: new Date()
        };
        await db.knex.update(updates).from<DBTeam>(`_nango_accounts`).where({ id });
    }

    async shouldShowHearAboutUs(account: Pick<DBTeam, 'id' | 'found_us'>): Promise<boolean> {
        const count = await userService.countUsers(account.id);
        const hasNotSetFoundUs = account.found_us === null || account.found_us === '';
        return hasNotSetFoundUs && count === 1;
    }

    async getAccountByUUID(uuid: string): Promise<DBTeam | null> {
        const result = await db.knex.select('*').from<DBTeam>(`_nango_accounts`).where({ uuid }).first();

        return result || null;
    }

    async getAccountAndEnvironmentIdByUUID(targetAccountUUID: string, targetEnvironment: string): Promise<{ accountId: number; environmentId: number } | null> {
        const [account] = await db.knex<DBTeam>(`_nango_accounts`).select('id').where({ uuid: targetAccountUUID });
        if (!account) {
            return null;
        }

        const environment = await environmentService.getByEnvironmentName(account.id, targetEnvironment);
        if (!environment) {
            return null;
        }

        return { accountId: account.id, environmentId: environment.id };
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
        return db.knex.transaction(async (trx) => {
            const emailTeamName = emailToTeamName({ email });
            const teamName = `${emailTeamName || name}'s Team`;
            const result = await trx.from<DBTeam>(`_nango_accounts`).insert({ name: teamName, found_us: foundUs }).returning('*');

            if (!result[0]) {
                trx.rollback();
                return null;
            }

            await environmentService.createDefaultEnvironments(trx, { accountId: result[0].id });
            if (flagHasPlan) {
                const freePlan = plansList.find((plan) => plan.code === 'free');
                const res = await createPlan(trx, { account_id: result[0].id, name: 'free', ...freePlan?.flags });
                if (res.isErr()) {
                    report(res.error);
                    // Rollback transaction
                    throw res.error;
                }
            }
            metrics.increment(metrics.Types.ACCOUNT_CREATED, 1, { accountId: result[0].id });
            return result[0];
        });
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

    async getAccountContextBySecretKey(secretKey: string): Promise<AccountContext | null> {
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

                    const accountContext = await this.getAccountContext({ accountId: env.account_id, envName });

                    if (!accountContext) {
                        return null;
                    }

                    return {
                        ...accountContext,
                        auth: {
                            source: 'api_secret',
                            scopes: ['environment:*']
                        }
                    };
                }
            }
        }

        return this.getAccountContext({ secretKey });
    }

    /**
     * Resolve account context using only api_secrets (no customer_keys lookup).
     * Used by internal services (persist) that authenticate with the
     * environment's internal secret key. Avoids polluting customer_keys.last_used_at.
     */
    async getAccountContextByInternalSecretKey(secretKey: string): Promise<AccountContext | null> {
        if (!isCloud) {
            const environmentVariables = Object.keys(process.env).filter((key) => key.startsWith('NANGO_SECRET_KEY_'));
            for (const environmentVariable of environmentVariables) {
                const envSecretKey = process.env[environmentVariable] as string;
                if (envSecretKey !== secretKey) {
                    continue;
                }
                const envName = environmentVariable.replace('NANGO_SECRET_KEY_', '').toLowerCase();
                const env = await db.knex
                    .select<Pick<DBEnvironment, 'account_id'>>('account_id')
                    .from<DBEnvironment>('_nango_environments')
                    .where({ name: envName, deleted: false })
                    .first();
                if (!env) {
                    return null;
                }
                const accountContext = await this.getAccountContext({ accountId: env.account_id, envName });
                if (!accountContext) {
                    return null;
                }
                return accountContext;
            }
        }

        return this.getAccountContext({ internalSecretKey: secretKey });
    }

    async getAccountContextByPublicKey(publicKey: string): Promise<AccountContext | null> {
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
            | { internalSecretKey: string }
            | { accountId: number; envName: string }
            | { environmentId: number }
            | { environmentUuid: string }
            | { accountUuid: string; envName: string }
    ): Promise<AccountContext | null> {
        if ('secretKey' in opts) {
            return this.getAccountContextByAnySecret(opts.secretKey);
        }
        if ('internalSecretKey' in opts) {
            return this.getAccountContextByInternalSecret(opts.internalSecretKey);
        }

        const q = db.readOnly
            .select<{
                account: DBTeam;
                environment: DBEnvironment;
                plan: DBPlan | null;
                default_secret: DBAPISecret;
                pending_secret: DBAPISecret | null;
            }>(
                db.knex.raw('row_to_json(_nango_environments.*) as environment'),
                db.knex.raw('row_to_json(_nango_accounts.*) as account'),
                db.knex.raw('row_to_json(plans.*) as plan'),
                db.knex.raw('row_to_json(default_secret.*) as default_secret'),
                db.knex.raw('row_to_json(pending_secret.*) as pending_secret')
            )
            .from<DBEnvironment>('_nango_environments')
            .join('_nango_accounts', '_nango_accounts.id', '_nango_environments.account_id')
            .join({ default_secret: 'api_secrets' }, (j) =>
                j.on('default_secret.environment_id', '_nango_environments.id').andOn('default_secret.is_default', db.knex.raw('true'))
            )
            .leftJoin({ pending_secret: 'api_secrets' }, (j) =>
                j.on('pending_secret.environment_id', '_nango_environments.id').andOn('pending_secret.is_default', db.knex.raw('false'))
            )
            .leftJoin('plans', 'plans.account_id', '_nango_accounts.id')
            .where('_nango_environments.deleted', false)
            .first();

        if ('publicKey' in opts) {
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

        const defaultSecret = encryptionManager.decryptAPISecret(res.default_secret);
        const pendingKey = res.pending_secret ? encryptionManager.decryptAPISecret(res.pending_secret) : null;

        return {
            // getting data with row_to_json breaks the automatic string to date parser
            account: {
                ...res.account,
                created_at: new Date(res.account.created_at),
                updated_at: new Date(res.account.updated_at)
            },
            environment: {
                ...res.environment,
                secret_key: defaultSecret.secret,
                pending_secret_key: pendingKey?.secret || null,
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
                : null,
            secret: defaultSecret
        };
    }

    private async getAccountContextByAnySecret(secretKey: string): Promise<AccountContext | null> {
        const cachedHash = hashLocalCache.get(secretKey);
        let hash: string;
        if (!cachedHash) {
            const hashed = await secretService.hashSecret(secretKey);
            if (hashed.isErr()) {
                throw hashed.error;
            }
            hash = hashed.value;
        } else {
            hash = cachedHash;
        }

        // This query debounces last_used_at in the same statement, so it must run on the primary.
        // If we later introduce real read replicas for auth lookups, split this into:
        // 1. read auth context from replica, 2. best-effort debounced update on primary.
        const {
            rows: [row]
        } = await db.knex.raw<{
            rows: {
                account: DBTeam;
                environment: DBEnvironment;
                plan: DBPlan | null;
                default_secret: DBAPISecret;
                pending_secret: DBAPISecret | null;
                auth_source: 'customer_key' | 'api_secret';
                auth_scopes: string[] | null;
                auth_api_key_id: number | null;
            }[];
        }>(
            `
                WITH matched_customer_key AS (
                    SELECT ck.id, ckr.entity_id AS environment_id, ck.scopes
                    FROM customer_keys ck
                    JOIN customer_keys_relations ckr ON ckr.customer_key_id = ck.id
                    WHERE ck.hashed = ?
                      AND ck.key_type = 'api'
                      AND ck.deleted_at IS NULL
                      AND ckr.entity_type = 'environment'
                    LIMIT 1
                ),
                updated_customer_key AS (
                    UPDATE customer_keys ck
                    SET last_used_at = NOW()
                    FROM matched_customer_key mck
                    WHERE ck.id = mck.id
                      AND (ck.last_used_at IS NULL OR ck.last_used_at < NOW() - INTERVAL '1 minute')
                    RETURNING ck.id
                ),
                matched_auth AS (
                    SELECT
                        mck.environment_id,
                        'customer_key'::text AS auth_source,
                        mck.scopes AS auth_scopes,
                        mck.id AS auth_api_key_id
                    FROM matched_customer_key mck
                    UNION ALL
                    SELECT
                        legacy.environment_id,
                        'api_secret'::text AS auth_source,
                        NULL::text[] AS auth_scopes,
                        NULL::integer AS auth_api_key_id
                    FROM api_secrets legacy
                    WHERE legacy.hashed = ?
                      AND legacy.is_default = true
                      AND NOT EXISTS (SELECT 1 FROM matched_customer_key)
                )
                SELECT
                    row_to_json(_nango_environments.*) AS environment,
                    row_to_json(_nango_accounts.*) AS account,
                    row_to_json(plans.*) AS plan,
                    row_to_json(default_secret.*) AS default_secret,
                    row_to_json(pending_secret.*) AS pending_secret,
                    matched_auth.auth_source,
                    matched_auth.auth_scopes,
                    matched_auth.auth_api_key_id
                FROM matched_auth
                JOIN _nango_environments ON _nango_environments.id = matched_auth.environment_id
                JOIN _nango_accounts ON _nango_accounts.id = _nango_environments.account_id
                JOIN api_secrets AS default_secret
                    ON default_secret.environment_id = _nango_environments.id
                   AND default_secret.is_default = true
                LEFT JOIN api_secrets AS pending_secret
                    ON pending_secret.environment_id = _nango_environments.id
                   AND pending_secret.is_default = false
                LEFT JOIN plans ON plans.account_id = _nango_accounts.id
                WHERE _nango_environments.deleted = false
                LIMIT 1;
            `,
            [hash, hash]
        );
        if (!row) {
            return null;
        }

        hashLocalCache.set(secretKey, hash);

        const defaultSecret = encryptionManager.decryptAPISecret(row.default_secret);
        const pendingKey = row.pending_secret ? encryptionManager.decryptAPISecret(row.pending_secret) : null;

        return {
            account: {
                ...row.account,
                created_at: new Date(row.account.created_at),
                updated_at: new Date(row.account.updated_at)
            },
            environment: {
                ...row.environment,
                secret_key: defaultSecret.secret,
                pending_secret_key: pendingKey?.secret || null,
                created_at: new Date(row.environment.created_at),
                updated_at: new Date(row.environment.updated_at),
                deleted_at: row.environment.deleted_at ? new Date(row.environment.deleted_at) : row.environment.deleted_at
            },
            plan: row.plan
                ? {
                      ...row.plan,
                      created_at: new Date(row.plan.created_at),
                      updated_at: new Date(row.plan.updated_at),
                      trial_start_at: row.plan.trial_start_at ? new Date(row.plan.trial_start_at) : row.plan.trial_start_at,
                      trial_end_at: row.plan.trial_end_at ? new Date(row.plan.trial_end_at) : row.plan.trial_end_at,
                      trial_end_notified_at: row.plan.trial_end_notified_at ? new Date(row.plan.trial_end_notified_at) : row.plan.trial_end_notified_at,
                      orb_subscribed_at: row.plan.orb_subscribed_at ? new Date(row.plan.orb_subscribed_at) : row.plan.orb_subscribed_at,
                      orb_future_plan_at: row.plan.orb_future_plan_at ? new Date(row.plan.orb_future_plan_at) : row.plan.orb_future_plan_at
                  }
                : null,
            secret: defaultSecret,
            auth: {
                source: row.auth_source,
                scopes: row.auth_source === 'api_secret' ? ['environment:*'] : (row.auth_scopes ?? []),
                ...(row.auth_api_key_id ? { apiKeyId: row.auth_api_key_id } : {})
            }
        };
    }

    /**
     * Resolve account context using only api_secrets (no customer_keys lookup).
     * Used by internal services (persist, runners) that authenticate with the
     * environment's internal secret key. Avoids polluting customer_keys.last_used_at.
     */
    private async getAccountContextByInternalSecret(secretKey: string): Promise<AccountContext | null> {
        const hashed = await secretService.hashSecret(secretKey);
        if (hashed.isErr()) {
            throw hashed.error;
        }

        const row = await db.readOnly
            .select<{
                account: DBTeam;
                environment: DBEnvironment;
                plan: DBPlan | null;
                default_secret: DBAPISecret;
                pending_secret: DBAPISecret | null;
            }>(
                db.knex.raw('row_to_json(_nango_environments.*) as environment'),
                db.knex.raw('row_to_json(_nango_accounts.*) as account'),
                db.knex.raw('row_to_json(plans.*) as plan'),
                db.knex.raw('row_to_json(default_secret.*) as default_secret'),
                db.knex.raw('row_to_json(pending_secret.*) as pending_secret')
            )
            .from<DBAPISecret>('api_secrets')
            .join('_nango_environments', '_nango_environments.id', 'api_secrets.environment_id')
            .join('_nango_accounts', '_nango_accounts.id', '_nango_environments.account_id')
            .join({ default_secret: 'api_secrets' }, (j) =>
                j.on('default_secret.environment_id', '_nango_environments.id').andOn('default_secret.is_default', db.knex.raw('true'))
            )
            .leftJoin({ pending_secret: 'api_secrets' }, (j) =>
                j.on('pending_secret.environment_id', '_nango_environments.id').andOn('pending_secret.is_default', db.knex.raw('false'))
            )
            .leftJoin('plans', 'plans.account_id', '_nango_accounts.id')
            .where('api_secrets.hashed', hashed.value)
            .where('api_secrets.is_default', true)
            .where('_nango_environments.deleted', false)
            .first();

        if (!row) {
            return null;
        }

        const defaultSecret = encryptionManager.decryptAPISecret(row.default_secret);
        const pendingKey = row.pending_secret ? encryptionManager.decryptAPISecret(row.pending_secret) : null;

        return {
            account: {
                ...row.account,
                created_at: new Date(row.account.created_at),
                updated_at: new Date(row.account.updated_at)
            },
            environment: {
                ...row.environment,
                secret_key: defaultSecret.secret,
                pending_secret_key: pendingKey?.secret || null,
                created_at: new Date(row.environment.created_at),
                updated_at: new Date(row.environment.updated_at),
                deleted_at: row.environment.deleted_at ? new Date(row.environment.deleted_at) : row.environment.deleted_at
            },
            plan: row.plan
                ? {
                      ...row.plan,
                      created_at: new Date(row.plan.created_at),
                      updated_at: new Date(row.plan.updated_at),
                      trial_start_at: row.plan.trial_start_at ? new Date(row.plan.trial_start_at) : row.plan.trial_start_at,
                      trial_end_at: row.plan.trial_end_at ? new Date(row.plan.trial_end_at) : row.plan.trial_end_at,
                      trial_end_notified_at: row.plan.trial_end_notified_at ? new Date(row.plan.trial_end_notified_at) : row.plan.trial_end_notified_at,
                      orb_subscribed_at: row.plan.orb_subscribed_at ? new Date(row.plan.orb_subscribed_at) : row.plan.orb_subscribed_at,
                      orb_future_plan_at: row.plan.orb_future_plan_at ? new Date(row.plan.orb_future_plan_at) : row.plan.orb_future_plan_at
                  }
                : null,
            secret: defaultSecret
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
