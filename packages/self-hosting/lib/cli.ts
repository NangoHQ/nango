import { parseArgs } from 'node:util';

import { cloudDb, destroyCloudDb } from './cloud/db/client.js';
import { kmsLicenseSigner } from './cloud/licensing/signer.js';
import { createCustomer, deleteCustomer, getCustomerByName } from './cloud/services/customer.service.js';
import { createInstallationKey, deleteInstallationKey, listInstallationKeys } from './cloud/services/installation-key.service.js';
import { deactivateLicense } from './cloud/services/installation-license.service.js';
import { createInstallation, deleteInstallation, getInstallationByUuid, listInstallations, updateInstallation } from './cloud/services/installation.service.js';
import { issueLicense } from './cloud/services/licensing.service.js';

import type { RegistryDb } from './cloud/services/db.js';
import type { DBSelfHostingCustomer, DBSelfHostingInstallation } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const SIGNING_KEY_ID = 'alias/nango-license-signing';

const usage = `usage: cli.js <command> [options]

customers
  create-customer      --name <name>
  delete-customer      --name <name>                  refused while it has live installations

installations
  create-installation  --customer <name> --name <name> --mode byoc|self_managed
                       --stage production|staging|development [--no-telemetry] [--alerts off|slack|oncall]
  update-installation  --installation <uuid> [--name <name>] [--telemetry|--no-telemetry] [--alerts off|slack|oncall]
  delete-installation  --installation <uuid>           deactivates its license and deletes its keys
  list-installations   [--customer <name>]

keys
  create-key           --installation <uuid>           prints the private key once, it is never stored
  delete-key           --kid <kid>
  list-keys            --installation <uuid>

licenses
  create-license       --installation <uuid> --expires-at <iso date> --grace-until <iso date>
                       replaces the active license, so it is also how a license is renewed
  disable-license      --installation <uuid>

Prints one JSON document to stdout.`;

const { positionals, values } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
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
        kid: { type: 'string' }
    }
});

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

function alerts(): { alerts?: DBSelfHostingInstallation['alerts'] } {
    return values.alerts ? { alerts: oneOf('alerts', values.alerts, ['off', 'slack', 'oncall']) } : {};
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

function describe(err: unknown): string {
    if (err instanceof AggregateError) {
        return err.errors.map(describe).join('; ');
    }
    return err instanceof Error ? err.message || err.name : String(err);
}

const commands: Record<string, (db: RegistryDb) => Promise<Result<unknown>>> = {
    'create-customer': (db) => createCustomer(db, { name: required('name', values.name) }),
    'delete-customer': (db) => deleteCustomer(db, { name: required('name', values.name) }),

    'create-installation': async (db) =>
        createInstallation(db, {
            customerId: (await customer(db, required('customer', values.customer))).id,
            name: required('name', values.name),
            mode: oneOf('mode', values.mode, ['byoc', 'self_managed']),
            stage: oneOf('stage', values.stage, ['production', 'staging', 'development']),
            ...(values.telemetry !== undefined && { telemetry: values.telemetry }),
            ...alerts()
        }),
    'update-installation': async (db) => {
        if (values.name === undefined && values.telemetry === undefined && values.alerts === undefined) {
            throw new Error('nothing to update: pass --name, --telemetry, --no-telemetry or --alerts');
        }
        return updateInstallation(db, {
            id: (await installation(db)).id,
            ...(values.name && { name: values.name }),
            ...(values.telemetry !== undefined && { telemetry: values.telemetry }),
            ...alerts()
        });
    },
    'delete-installation': async (db) => deleteInstallation(db, { id: (await installation(db)).id }),
    'list-installations': async (db) => listInstallations(db, values.customer ? { customerId: (await customer(db, values.customer)).id } : {}),

    'create-key': async (db) => createInstallationKey(db, { installationId: (await installation(db)).id }),
    'delete-key': (db) => deleteInstallationKey(db, { kid: required('kid', values.kid) }),
    'list-keys': async (db) => listInstallationKeys(db, { installationId: (await installation(db)).id }),

    'create-license': async (db) =>
        issueLicense(db, {
            installation: await installation(db),
            expiresAt: date('expires-at', values['expires-at']),
            graceUntil: date('grace-until', values['grace-until']),
            signer: await kmsLicenseSigner({ keyId: SIGNING_KEY_ID })
        }),
    'disable-license': async (db) => deactivateLicense(db, { installationId: (await installation(db)).id })
};

const command = commands[positionals[0] ?? ''];
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
