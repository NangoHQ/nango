import type { Knex } from 'knex';
import { isStandalone } from '../../env.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw('DROP TYPE IF EXISTS log_level');
    await knex.raw('DROP TYPE IF EXISTS log_state');
    await knex.raw(`CREATE TYPE log_level AS ENUM ('trace', 'debug', 'info', 'warn', 'error')`);
    await knex.raw(`CREATE TYPE log_state AS ENUM ('waiting', 'running', 'success', 'failed', 'timeout', 'cancelled')`);

    await knex.raw(`CREATE TABLE "operations" (
    "id" uuid DEFAULT ${isStandalone ? '' : 'nango.'}uuid_generate_v4 (),

    "account_id" int4 NOT NULL,
    "account_name" varchar(255) NOT NULL,

    "environment_id" int4 NOT NULL,
    "environment_name" varchar(255) NOT NULL,

    "config_id" int4,
    "config_name" varchar(255),

    "connection_id" int4,
    "connection_name" varchar(255),

    "sync_id" uuid,
    "sync_name" varchar(255),

    "job_id" int4,
    "user_id" int4,

    "type" varchar(50) NOT NULL,
    "title" varchar(255),
    "level" log_level DEFAULT 'info' NOT NULL,
    "state" log_state DEFAULT 'waiting' NOT NULL,
    "code" varchar(100),

    "created_at" timestamp without time zone DEFAULT NOW() NOT NULL,
    "updated_at" timestamp without time zone DEFAULT NOW() NOT NULL,

    "started_at" timestamp without time zone,
    "ended_at" timestamp without time zone
  )
  PARTITION BY RANGE (created_at);`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP TYPE IF EXISTS log_level');
    await knex.raw('DROP TYPE IF EXISTS log_state');
    await knex.raw('DROP TABLE IF EXISTS operations');
}
