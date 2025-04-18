exports.config = { transaction: false };

const utils = require('node:util');
const crypto = require('node:crypto');

const pbkdf2 = utils.promisify(crypto.pbkdf2);
const ENCRYPTION_KEY = process.env['NANGO_ENCRYPTION_KEY'];

function decrypt(enc, iv, authTag) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'base64'), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
    let str = decipher.update(enc, 'base64', 'utf8');
    str += decipher.final('utf8');
    return str;
}

exports.up = async function (knex) {
    // Previous migration wrongly assumed ENCRYPTION was mandatory, so we need to backfill rows with empty hash
    const envs = await knex.select('*').from(`_nango_environments`).where({ secret_key_hashed: null });

    for (const env of envs) {
        const decrypted = ENCRYPTION_KEY && env.secret_key_iv ? decrypt(env.secret_key, env.secret_key_iv, env.secret_key_tag) : env.secret_key;
        await knex
            .from(`_nango_environments`)
            .where({ id: env.id })
            .update({
                secret_key_hashed: !ENCRYPTION_KEY ? env.secret_key : (await pbkdf2(decrypted, ENCRYPTION_KEY, 310000, 32, 'sha256')).toString('base64')
            });
    }
};

exports.down = async function () {};
