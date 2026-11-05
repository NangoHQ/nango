import { parseArgs } from 'node:util';

import { cloudDb, destroyCloudDb } from './cloud/db/client.js';
import { kmsLicenseSigner } from './cloud/licensing/signer.js';
import { deleteInstallationKey } from './cloud/services/installation-key.service.js';
import { disableInstallation, onboardInstallation, renewLicense, rotateInstallationKey } from './cloud/services/licensing.service.js';

import type { RegistryDb } from './cloud/services/db.js';
import type { Result } from '@nangohq/utils';

const SIGNING_KEY_ID = 'alias/nango-license-signing';

const usage = `usage: cli.js <command> [options]

  create      --customer <name> --name <name> --mode byoc|self_managed --stage production|staging|development
              --expires-at <iso date> --grace-until <iso date> [--no-telemetry] [--alerts off|slack|oncall]
  renew       --installation <uuid> --expires-at <iso date> --grace-until <iso date>
  rotate-key  --installation <uuid>
  delete-key  --kid <kid>
  disable     --installation <uuid>

Prints one JSON document to stdout. The private key in it is shown once and never stored.`;

const { positionals, values } = parseArgs({
    allowPositionals: true,
    allowNegative: true,
    options: {
        customer: { type: 'string' },
        name: { type: 'string' },
        mode: { type: 'string' },
        stage: { type: 'string' },
        telemetry: { type: 'boolean', default: true },
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

function describe(err: unknown): string {
    if (err instanceof AggregateError) {
        return err.errors.map(describe).join('; ');
    }
    return err instanceof Error ? err.message || err.name : String(err);
}

const signer = () => kmsLicenseSigner({ keyId: SIGNING_KEY_ID });

const commands: Record<string, (db: RegistryDb) => Promise<Result<unknown>>> = {
    create: async (db) =>
        onboardInstallation(db, {
            customer: required('customer', values.customer),
            name: required('name', values.name),
            mode: oneOf('mode', values.mode, ['byoc', 'self_managed']),
            stage: oneOf('stage', values.stage, ['production', 'staging', 'development']),
            telemetry: values.telemetry,
            ...(values.alerts && { alerts: oneOf('alerts', values.alerts, ['off', 'slack', 'oncall']) }),
            expiresAt: date('expires-at', values['expires-at']),
            graceUntil: date('grace-until', values['grace-until']),
            signer: await signer()
        }),
    renew: async (db) =>
        renewLicense(db, {
            installationUuid: required('installation', values.installation),
            expiresAt: date('expires-at', values['expires-at']),
            graceUntil: date('grace-until', values['grace-until']),
            signer: await signer()
        }),
    'rotate-key': (db) => rotateInstallationKey(db, { installationUuid: required('installation', values.installation) }),
    'delete-key': (db) => deleteInstallationKey(db, { kid: required('kid', values.kid) }),
    disable: (db) => disableInstallation(db, { installationUuid: required('installation', values.installation) })
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
