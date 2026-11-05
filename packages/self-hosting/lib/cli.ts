import { parseArgs } from 'node:util';

import { cloudDb, destroyCloudDb } from './cloud/db/client.js';
import { kmsLicenseSigner } from './cloud/licensing/signer.js';
import { createCustomer, deleteCustomer, getCustomerByName, listCustomers } from './cloud/services/customer.service.js';
import { createInstallationKey, deleteInstallationKey, listInstallationKeys } from './cloud/services/installation-key.service.js';
import { deactivateLicense, getActiveLicense, listLicenses } from './cloud/services/installation-license.service.js';
import { createInstallation, deleteInstallation, getInstallationByUuid, listInstallations, updateInstallation } from './cloud/services/installation.service.js';
import { issueLicense } from './cloud/services/licensing.service.js';

import type { RegistryDb } from './cloud/services/db.js';
import type { DBSelfHostingCustomer, DBSelfHostingInstallation } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const SIGNING_KEY_ID = 'alias/nango-license-signing';

const usage = `usage: node packages/self-hosting/dist/cli.js <command> [options]

customers
  create-customer      --name <name>
  list-customers       [--all]
  delete-customer      --name <name> --yes             takes its installations down too

installations
  create-installation  --customer <name> --name <name> --mode byoc|self_managed
                       --stage production|staging|development [--no-telemetry] [--alerts off|slack|oncall]
  update-installation  --installation <uuid> [--name <name>] [--telemetry|--no-telemetry] [--alerts off|slack|oncall]
  delete-installation  --installation <uuid> --yes     deactivates its license and deletes its keys
  list-installations   [--customer <name>] [--all]

keys
  create-key           --installation <uuid>           prints the private key once, it is never stored
  delete-key           --kid <kid> --yes
  list-keys            --installation <uuid> [--all]

licenses
  create-license       --installation <uuid> --expires-at <iso date> --grace-until <iso date>
                       replaces the active license, so it is also how a license is renewed
  disable-license      --installation <uuid> --yes
  list-licenses        --installation <uuid>             every license ever issued, active or not

Prints one JSON document to stdout. Without --yes a delete or disable only prints what it would touch.
Deletes are soft; --all on a list includes the deleted rows.`;

function parse() {
    return parseArgs({
        allowPositionals: true,
        allowNegative: true,
        strict: true,
        options: {
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

let parsed: ReturnType<typeof parse>;
try {
    parsed = parse();
} catch (err) {
    console.error(`${describe(err)}\n\n${usage}`);
    process.exit(1);
}
const { positionals, values } = parsed;

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

function alerts(mode: DBSelfHostingInstallation['mode']): { alerts?: DBSelfHostingInstallation['alerts'] } {
    if (!values.alerts) {
        return {};
    }
    const chosen = oneOf('alerts', values.alerts, ['off', 'slack', 'oncall']);
    if (mode === 'self_managed' && chosen !== 'off') {
        throw new Error('a self-managed installation is not in our Datadog, --alerts must be off');
    }
    return { alerts: chosen };
}

async function customer(db: RegistryDb, name: string): Promise<DBSelfHostingCustomer> {
    const found = (await getCustomerByName(db, { name })).unwrap();
    if (!found) {
        throw new Error(`no live customer ${name}`);
    }
    return found;
}

async function installation(db: RegistryDb): Promise<DBSelfHostingInstallation> {
    const uuid = required('installation', values.installation);
    const found = (await getInstallationByUuid(db, { uuid })).unwrap();
    if (!found) {
        throw new Error(`no live installation ${uuid}`);
    }
    return found;
}

function confirmed(preview: unknown): void {
    if (!values.yes) {
        console.log(JSON.stringify(preview, null, 2));
        throw new Error('nothing changed, re-run with --yes to proceed');
    }
}

async function cascade(db: RegistryDb, row: DBSelfHostingInstallation) {
    return {
        installation: { uuid: row.uuid, name: row.name },
        keys: (await listInstallationKeys(db, { installationId: row.id })).unwrap().map((k) => k.kid),
        activeLicense: (await getActiveLicense(db, { installationId: row.id })).unwrap()?.expires_at ?? null
    };
}

function describe(err: unknown): string {
    if (err instanceof AggregateError) {
        return err.errors.map(describe).join('; ');
    }
    return err instanceof Error ? err.message || err.name : String(err);
}

const commands: Record<string, (db: RegistryDb) => Promise<Result<unknown>>> = {
    'create-customer': (db) => createCustomer(db, { name: required('name', values.name) }),
    'list-customers': (db) => listCustomers(db, { includeDeleted: values.all }),
    'delete-customer': async (db) => {
        const row = await customer(db, required('name', values.name));
        const installations = (await listInstallations(db, { customerId: row.id })).unwrap();
        confirmed({ customer: row.name, installations: await Promise.all(installations.map((i) => cascade(db, i))) });
        return deleteCustomer(db, { name: row.name });
    },

    'create-installation': async (db) => {
        const mode = oneOf('mode', values.mode, ['byoc', 'self_managed']);
        return createInstallation(db, {
            customerId: (await customer(db, required('customer', values.customer))).id,
            name: required('name', values.name),
            mode,
            stage: oneOf('stage', values.stage, ['production', 'staging', 'development']),
            ...(values.telemetry !== undefined && { telemetry: values.telemetry }),
            ...alerts(mode)
        });
    },
    'update-installation': async (db) => {
        if (values.name === undefined && values.telemetry === undefined && values.alerts === undefined) {
            throw new Error('nothing to update: pass --name, --telemetry, --no-telemetry or --alerts');
        }
        const row = await installation(db);
        return updateInstallation(db, {
            id: row.id,
            ...(values.name !== undefined && { name: required('name', values.name) }),
            ...(values.telemetry !== undefined && { telemetry: values.telemetry }),
            ...alerts(row.mode)
        });
    },
    'delete-installation': async (db) => {
        const row = await installation(db);
        confirmed(await cascade(db, row));
        return deleteInstallation(db, { id: row.id });
    },
    'list-installations': async (db) =>
        listInstallations(db, { includeDeleted: values.all, ...(values.customer && { customerId: (await customer(db, values.customer)).id }) }),

    'create-key': async (db) => createInstallationKey(db, { installationId: (await installation(db)).id }),
    'delete-key': (db) => {
        const kid = required('kid', values.kid);
        confirmed({ kid });
        return deleteInstallationKey(db, { kid });
    },
    'list-keys': async (db) => listInstallationKeys(db, { installationId: (await installation(db)).id, includeDeleted: values.all }),

    'create-license': async (db) =>
        issueLicense(db, {
            installation: await installation(db),
            expiresAt: date('expires-at', values['expires-at']),
            graceUntil: date('grace-until', values['grace-until']),
            signer: await kmsLicenseSigner({ keyId: SIGNING_KEY_ID })
        }),
    'list-licenses': async (db) => listLicenses(db, { installationId: (await installation(db)).id }),
    'disable-license': async (db) => {
        const row = await installation(db);
        confirmed({ installation: row.name, activeLicense: (await getActiveLicense(db, { installationId: row.id })).unwrap()?.expires_at ?? null });
        return deactivateLicense(db, { installationId: row.id });
    }
};

const command = positionals.length === 1 ? commands[positionals[0] ?? ''] : undefined;
if (!command) {
    console.error(usage);
    process.exitCode = 1;
} else {
    try {
        const result = await command({ knex: cloudDb() });
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
