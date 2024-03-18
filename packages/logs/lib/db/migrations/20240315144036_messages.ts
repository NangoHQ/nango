import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`CREATE TABLE "messages" (
      "id" uuid DEFAULT uuid_generate_v4 (),

      "operation_id" uuid,
      "content" json,

      "created_at" timestamp without time zone DEFAULT NOW()
    )
    PARTITION BY RANGE (created_at);`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP TABLE operations');
}
