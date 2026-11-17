import { parseArgs } from 'node:util';

import { cloudDb, destroyCloudDb } from './cloud/db/client.js';
import { kmsLicenseSigner } from './cloud/licensing/signer.js';
import { createCustomer, deleteCustomer, deleteCustomerPreview, listCustomers, requireCustomer } from './cloud/services/customer.service.js';
import { createInstallationKey, deleteInstallationKey, listInstallationKeys, requireInstallationKey } from './cloud/services/installation-key.service.js';
import { deactivateLicense, getActiveLicense, listLicenses } from './cloud/services/installation-license.service.js';
import {
    createInstallation,
    deleteInstallation,
    deleteInstallationPreview,
    requireInstallation,
    searchInstallations,
    updateInstallation
} from './cloud/services/installation.service.js';
import { issueLicense } from './cloud/services/licensing.service.js';

import type { RegistryDb } from './cloud/services/db.js';
import type { Result } from '@nangohq/utils';

const SIGNING_KEY_ID = 'alias/nango-license-signing';

type Handler = (db: RegistryDb) => Promise<Result<unknown>>;

interface Entity {
    usage: string;
    verbs: Record<string, Handler>;
}

function parse() {
    return parseArgs({
        allowPositionals: true,
        allowNegative: true,
        strict: true,
        options: {
            help: { type: 'boolean', default: false },
            customer: { type: 'string' },
            name: { type: 'string' },
            mode: { type: 'string' },
            stage: { type: 'string' },
            telemetry: { type: 'boolean' },
            alerts: { type: 'string' },
            'expires-at': { type: 'string' },
            'grace-until': { type: 'string' },
            installation: { type: 'string' },
            kid: { type: 'string' },
            yes: { type: 'boolean' },
            all: { type: 'boolean', default: false }
        }
    });
}

function required(name: string, value: string | undefined): string {
    if (!value) {
        throw new Error(`--${name} is required`);
    }
    return value;
}

function oneOf<T extends string>(name: string, value: string | undefined, allowed: readonly T[]): T {
    const found = allowed.find((candidate) => candidate === value);
    if (!found) {
        throw new Error(`--${name} must be one of ${allowed.join(', ')}`);
    }
    return found;
}

function date(name: string, value: string | undefined): Date {
    const parsed = new Date(required(name, value));
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`--${name} is not a date`);
    }
    return parsed;
}

const MODES = ['byoc', 'self_managed'] as const;
const STAGES = ['production', 'staging', 'development'] as const;
const ALERTS = ['off', 'slack', 'oncall'] as const;

const installation = (db: RegistryDb, { includeDeleted = false }: { includeDeleted?: boolean } = {}) =>
    requireInstallation(db, { uuid: required('installation', values.installation), includeDeleted });

function confirmed(preview: unknown): void {
    if (!values.yes) {
        console.log(JSON.stringify(preview, null, 2));
        throw new Error('nothing changed, re-run with --yes to proceed');
    }
}

function describe(err: unknown): string {
    if (err instanceof AggregateError) {
        return err.errors.map(describe).join('; ');
    }
    return err instanceof Error ? err.message || err.name : String(err);
}

const entities: Record<string, Entity> = {
    customer: {
        usage: `customer create  --name <name>
customer delete  --name <name> [--yes]               takes its installations down too
customer list    [--all]`,
        verbs: {
            create: (db) => createCustomer(db, { name: required('name', values.name) }),
            delete: async (db) => {
                const customer = (await requireCustomer(db, { name: required('name', values.name) })).unwrap();
                confirmed((await deleteCustomerPreview(db, { customer })).unwrap());
                return deleteCustomer(db, { name: customer.name });
            },
            list: (db) => listCustomers(db, { includeDeleted: values.all })
        }
    },
    installation: {
        usage: `installation create  --customer <name> --name <name> --mode byoc|self_managed --stage production|staging|development
                     [--no-telemetry] [--alerts off|slack|oncall]
installation update  --installation <uuid> [--name <name>] [--mode byoc|self_managed] [--stage production|staging|development]
                     [--telemetry|--no-telemetry] [--alerts off|slack|oncall]
installation delete  --installation <uuid> [--yes]   deactivates its license and deletes its keys
installation list    [--customer <name>] [--all]`,
        verbs: {
            create: async (db) =>
                createInstallation(db, {
                    customerId: (await requireCustomer(db, { name: required('customer', values.customer) })).unwrap().id,
                    name: required('name', values.name),
                    mode: oneOf('mode', values.mode, MODES),
                    stage: oneOf('stage', values.stage, STAGES),
                    ...(values.telemetry !== undefined && { telemetry: values.telemetry }),
                    ...(values.alerts && { alerts: oneOf('alerts', values.alerts, ALERTS) })
                }),
            update: async (db) =>
                updateInstallation(db, {
                    id: (await installation(db)).unwrap().id,
                    ...(values.name !== undefined && { name: required('name', values.name) }),
                    ...(values.mode && { mode: oneOf('mode', values.mode, MODES) }),
                    ...(values.stage && { stage: oneOf('stage', values.stage, STAGES) }),
                    ...(values.telemetry !== undefined && { telemetry: values.telemetry }),
                    ...(values.alerts && { alerts: oneOf('alerts', values.alerts, ALERTS) })
                }),
            delete: async (db) => {
                const row = (await installation(db)).unwrap();
                confirmed((await deleteInstallationPreview(db, { installation: row })).unwrap());
                return deleteInstallation(db, { id: row.id });
            },
            list: async (db) =>
                searchInstallations(db, values.customer ? { customerId: (await requireCustomer(db, { name: values.customer })).unwrap().id } : undefined, {
                    includeDeleted: values.all
                })
        }
    },
    key: {
        usage: `key create  --installation <uuid>               prints the private key once, it is never stored
key delete  --kid <kid> [--yes]
key list    --installation <uuid> [--all]`,
        verbs: {
            create: async (db) => createInstallationKey(db, { installationId: (await installation(db)).unwrap().id }),
            delete: async (db) => {
                const key = (await requireInstallationKey(db, { kid: required('kid', values.kid) })).unwrap();
                confirmed({ kid: key.kid, created_at: key.created_at });
                return deleteInstallationKey(db, { kid: key.kid });
            },
            list: async (db) =>
                listInstallationKeys(db, { installationId: (await installation(db, { includeDeleted: values.all })).unwrap().id, includeDeleted: values.all })
        }
    },
    license: {
        usage: `license create   --installation <uuid> --expires-at <iso date> --grace-until <iso date>
                 replaces the active license, so it is also how a license is renewed
license disable  --installation <uuid> [--yes]
license list     --installation <uuid>               every license ever issued, active or not`,
        verbs: {
            create: async (db) =>
                issueLicense(db, {
                    installation: (await installation(db)).unwrap(),
                    expiresAt: date('expires-at', values['expires-at']),
                    graceUntil: date('grace-until', values['grace-until']),
                    signer: await kmsLicenseSigner({ keyId: SIGNING_KEY_ID })
                }),
            disable: async (db) => {
                const row = (await installation(db)).unwrap();
                const active = (await getActiveLicense(db, { installationId: row.id })).unwrap();
                if (!active) {
                    throw new Error(`installation ${row.name} has no active license`);
                }
                confirmed({ installation: row.name, activeLicense: active.expires_at });
                return deactivateLicense(db, { installationId: row.id });
            },
            list: async (db) => listLicenses(db, { installationId: (await installation(db, { includeDeleted: true })).unwrap().id })
        }
    }
};

function overview(): string {
    return `usage: node packages/self-hosting/dist/cli.js <entity> <verb> [options]

${Object.values(entities)
    .map((e) => e.usage)
    .join('\n\n')}

Prints one JSON document to stdout. Without --yes a delete or disable only prints what it would touch.
Deletes are soft; --all on a list includes the deleted rows. <entity> --help prints that entity's verbs.`;
}

let parsed: ReturnType<typeof parse>;
try {
    parsed = parse();
} catch (err) {
    console.error(`${describe(err)}\n\n${overview()}`);
    process.exit(1);
}
const { positionals, values } = parsed;

const [entityName = '', verbName = ''] = positionals;
const entity = entities[entityName];
const verb = entity?.verbs[verbName];
if (values.help) {
    console.log(entity?.usage ?? overview());
} else if (!entity || positionals.length > 2) {
    console.error(overview());
    process.exitCode = 1;
} else if (!verb) {
    console.error(entity.usage);
    process.exitCode = 1;
} else {
    try {
        const result = await verb({ knex: cloudDb() });
        if (result.isErr()) {
            throw result.error;
        }
        console.log(JSON.stringify(result.value ?? { ok: true }, null, 2));
    } catch (err) {
        console.error(describe(err));
        process.exitCode = 1;
    } finally {
        await destroyCloudDb();
    }
}
