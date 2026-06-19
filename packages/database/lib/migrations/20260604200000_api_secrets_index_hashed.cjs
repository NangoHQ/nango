exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "api_secrets_hashed" ON "api_secrets" ("hashed")`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

/*
 Limit  (cost=1.86..18.44 rows=1 width=160) (actual time=0.169..0.171 rows=1 loops=1)
  Buffers: shared hit=27
  ->  Nested Loop Left Join  (cost=1.86..18.44 rows=1 width=160) (actual time=0.168..0.170 rows=1 loops=1)
        Buffers: shared hit=27
        ->  Nested Loop Left Join  (cost=1.57..17.93 rows=1 width=1146) (actual time=0.069..0.070 rows=1 loops=1)
              Buffers: shared hit=16
              ->  Nested Loop  (cost=1.28..17.50 rows=1 width=957) (actual time=0.059..0.060 rows=1 loops=1)
                    Buffers: shared hit=13
                    ->  Nested Loop  (cost=0.99..17.07 rows=1 width=768) (actual time=0.050..0.051 rows=1 loops=1)
                          Buffers: shared hit=10
                          ->  Nested Loop  (cost=0.70..16.74 rows=1 width=682) (actual time=0.034..0.034 rows=1 loops=1)
                                Buffers: shared hit=7
                                ->  Index Scan using api_secrets_hashed on api_secrets  (cost=0.41..8.43 rows=1 width=4) (actual time=0.014..0.014 rows=1 loops=1)
                                      Index Cond: ((hashed)::text = 'HUP0BXl6KXV4eExqNjPxwCtmGqPcwaczM21BRvAYqKQ='::text)
                                      Filter: is_default
                                      Buffers: shared hit=4
                                ->  Index Scan using _nango_environments_pkey on _nango_environments  (cost=0.29..8.31 rows=1 width=678) (actual time=0.019..0.019 rows=1 loops=1)
                                      Index Cond: (id = api_secrets.environment_id)
                                      Filter: (NOT deleted)
                                      Buffers: shared hit=3
                          ->  Index Scan using _nango_accounts_pkey on _nango_accounts  (cost=0.29..0.33 rows=1 width=90) (actual time=0.015..0.015 rows=1 loops=1)
                                Index Cond: (id = _nango_environments.account_id)
                                Buffers: shared hit=3
                    ->  Index Scan using api_secrets_one_default_per_environment on api_secrets default_secret  (cost=0.29..0.42 rows=1 width=197) (actual time=0.008..0.008 rows=1 loops=1)
                          Index Cond: (environment_id = _nango_environments.id)
                          Buffers: shared hit=3
              ->  Index Scan using api_secrets_environment_id on api_secrets pending_secret  (cost=0.29..0.42 rows=1 width=197) (actual time=0.009..0.009 rows=0 loops=1)
                    Index Cond: (environment_id = _nango_environments.id)
                    Filter: (NOT is_default)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=3
        ->  Index Scan using idx_account_id on plans  (cost=0.29..0.50 rows=1 width=784) (actual time=0.016..0.016 rows=1 loops=1)
              Index Cond: (account_id = _nango_accounts.id)
              Buffers: shared hit=3
Planning:
  Buffers: shared hit=663
Planning Time: 3.190 ms
Execution Time: 0.221 ms

*********************
Limit  (cost=1.44..1483.64 rows=1 width=160) (actual time=1.048..1.050 rows=1 loops=1)
  Buffers: shared hit=221
  ->  Nested Loop Left Join  (cost=1.44..1483.64 rows=1 width=160) (actual time=1.048..1.049 rows=1 loops=1)
        Buffers: shared hit=221
        ->  Nested Loop Left Join  (cost=1.16..1483.13 rows=1 width=1146) (actual time=1.000..1.001 rows=1 loops=1)
              Buffers: shared hit=218
              ->  Nested Loop  (cost=0.87..1482.70 rows=1 width=957) (actual time=0.993..0.994 rows=1 loops=1)
                    Buffers: shared hit=215
                    ->  Nested Loop  (cost=0.58..1482.27 rows=1 width=768) (actual time=0.982..0.982 rows=1 loops=1)
                          Buffers: shared hit=212
                          ->  Nested Loop  (cost=0.29..1481.93 rows=1 width=682) (actual time=0.973..0.973 rows=1 loops=1)
                                Buffers: shared hit=209
                                ->  Seq Scan on api_secrets  (cost=0.00..1473.62 rows=1 width=4) (actual time=0.955..0.955 rows=1 loops=1)
                                      Filter: (is_default AND ((hashed)::text = 'HUP0BXl6KXV4eExqNjPxwCtmGqPcwaczM21BRvAYqKQ='::text))
                                      Rows Removed by Filter: 8188
                                      Buffers: shared hit=206
                                ->  Index Scan using _nango_environments_pkey on _nango_environments  (cost=0.29..8.31 rows=1 width=678) (actual time=0.016..0.016 rows=1 loops=1)
                                      Index Cond: (id = api_secrets.environment_id)
                                      Filter: (NOT deleted)
                                      Buffers: shared hit=3
                          ->  Index Scan using _nango_accounts_pkey on _nango_accounts  (cost=0.29..0.33 rows=1 width=90) (actual time=0.008..0.008 rows=1 loops=1)
                                Index Cond: (id = _nango_environments.account_id)
                                Buffers: shared hit=3
                    ->  Index Scan using api_secrets_one_default_per_environment on api_secrets default_secret  (cost=0.29..0.42 rows=1 width=197) (actual time=0.010..0.010 rows=1 loops=1)
                          Index Cond: (environment_id = _nango_environments.id)
                          Buffers: shared hit=3
              ->  Index Scan using api_secrets_environment_id on api_secrets pending_secret  (cost=0.29..0.42 rows=1 width=197) (actual time=0.006..0.006 rows=0 loops=1)
                    Index Cond: (environment_id = _nango_environments.id)
                    Filter: (NOT is_default)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=3
        ->  Index Scan using idx_account_id on plans  (cost=0.29..0.50 rows=1 width=784) (actual time=0.013..0.013 rows=1 loops=1)
              Index Cond: (account_id = _nango_accounts.id)
              Buffers: shared hit=3
Planning:
  Buffers: shared hit=108
Planning Time: 1.725 ms
Execution Time: 1.098 ms
 */
