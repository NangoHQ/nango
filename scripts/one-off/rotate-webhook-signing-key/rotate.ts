import './loadEnv.js';

import crypto from 'crypto';

import { database } from '@nangohq/database';
import { getEncryptionManager, pbkdf2 } from '@nangohq/shared';
import { PBKDF2_ITERATIONS } from '@nangohq/utils';

function parseArgs() {
    const args = process.argv.slice(2);
    const get = (flag: string) => {
        const val = args.find((a) => a.startsWith(`${flag}=`));
        return val ? val.slice(flag.length + 1) : undefined;
    };

    const accountId = get('--account-id');
    const environmentId = get('--environment-id');
    const confirmed = args.includes('--yes');

    if (!accountId || !environmentId) {
        console.error('Usage: npx tsx scripts/one-off/rotate-webhook-signing-key/rotate.ts --account-id=<id> --environment-id=<id> [--yes]');
        process.exit(1);
    }

    return { accountId: Number(accountId), environmentId: Number(environmentId), confirmed };
}

async function rotate() {
    const { accountId, environmentId, confirmed } = parseArgs();

    const env = await database.knex('_nango_environments').where({ id: environmentId, account_id: accountId }).first();
    if (!env) {
        console.error(`No environment ${environmentId} found for account ${accountId} — refusing to proceed.`);
        process.exit(1);
    }

    const existing = await database
        .knex('customer_keys')
        .join('customer_keys_relations', 'customer_keys_relations.customer_key_id', 'customer_keys.id')
        .where('customer_keys.key_type', 'webhook_signing')
        .where('customer_keys_relations.entity_type', 'environment')
        .where('customer_keys_relations.entity_id', environmentId)
        .whereNull('customer_keys.deleted_at')
        .select('customer_keys.id');

    console.log(`Environment: ${env.name} (account ${accountId}, environment ${environmentId})`);
    console.log(`Existing active webhook_signing key row(s): ${existing.map((r) => r.id).join(', ') || 'none'}`);

    if (!confirmed) {
        console.log('\nDry run only — pass --yes to actually rotate.');
        console.log('Reminder: packages/server and packages/jobs cache this key in memory with no eviction.');
        console.log('Every replica of both services must restart after this runs, or some will keep signing with the old key.');
        process.exit(0);
    }

    const plainText = crypto.randomUUID();
    const [secret, iv, tag] = getEncryptionManager().encryptSync(plainText);
    const hashed = (await pbkdf2(plainText, getEncryptionManager().getKey(), PBKDF2_ITERATIONS, 32, 'sha256')).toString('base64');

    const newKeyId = await database.knex.transaction(async (trx) => {
        const updated = await trx('customer_keys')
            .where('key_type', 'webhook_signing')
            .whereNull('deleted_at')
            .whereIn(
                'id',
                existing.map((r) => r.id)
            )
            .update({ deleted_at: trx.fn.now() });
        console.log(`Soft-deleted ${updated} old key row(s).`);

        const [created] = await trx('customer_keys')
            .insert({
                account_id: accountId,
                key_type: 'webhook_signing',
                display_name: 'Webhook signing',
                secret,
                iv,
                tag,
                hashed
            })
            .returning('id');

        await trx('customer_keys_relations').insert({
            customer_key_id: created.id,
            entity_type: 'environment',
            entity_id: environmentId
        });

        return created.id;
    });

    console.log(`\nCreated new webhook_signing key, id=${newKeyId}.`);
    console.log(`New secret (only shown once — this cannot be recovered from the DB after this point):\n${plainText}`);
    console.log('\nNext: restart every replica of packages/server and packages/jobs for this DB before telling the customer to switch.');
}

rotate()
    .catch((err: unknown) => {
        console.error('Error occurred during webhook signing key rotation:', err);
        process.exit(1);
    })
    .finally(() => {
        process.exit(0);
    });
