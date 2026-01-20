exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        create table if not exists api_secrets (
            id             serial primary key,
            environment_id integer not null references _nango_environments(id),
            name           varchar(255) not null,
            secret         varchar(255) not null,
            iv             varchar(255) not null,
            tag            varchar(255) not null,
            hashed         varchar(255) not null,
            is_default     boolean not null default false,
            created_at     timestamptz not null default CURRENT_TIMESTAMP,
            updated_at     timestamptz not null default CURRENT_TIMESTAMP
        );

        create index if not exists api_secrets_environment_id on api_secrets (environment_id);

        create unique index if not exists api_secrets_one_default_per_environment
            on api_secrets (environment_id)
            where is_default = true;

        insert into api_secrets (environment_id, name, secret, iv, tag, hashed, is_default)
            select
                id                as environment_id,
                'default'         as name,
                secret_key        as secret,
                secret_key_iv     as iv,
                secret_key_tag    as tag,
                secret_key_hashed as hashed,
                true              as is_default
            from
                _nango_environments
            where
                secret_key is not null
                and secret_key_iv is not null
                and secret_key_tag is not null
                and secret_key_hashed is not null;
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`
        drop table if exists api_secrets;
    `);
};
