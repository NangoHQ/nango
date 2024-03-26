/* eslint-disable @typescript-eslint/no-var-requires */
const { hashSecretKey } = require('../../../dist/services/environment.service.js');
const { default: encryptionManager } = require('../../../dist/utils/encryption.manager.js');

exports.up = async function (knex) {
    await knex.schema.raw('ALTER TABLE "_nango_environments" ADD COLUMN IF NOT EXISTS "secret_key_hashed" varchar(64)');

    const envs = await knex.select('*').from(`_nango_environments`).where({ secret_key_hashed: null });

    for (const env of envs) {
        const decrypted = await encryptionManager.decryptEnvironment(env);
        await knex
            .from(`_nango_environments`)
            .where({ id: env.id })
            .update({ secret_key_hashed: await hashSecretKey(decrypted.secret_key) });
    }
};

exports.down = async function (knex) {
    await knex.schema.raw('ALTER TABLE "_nango_environments" DROP COLUMN IF EXISTS "secret_key_hashed"');
};
