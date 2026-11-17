import type { Knex } from 'knex';

export function whereHttpTrigger(query: Knex.QueryBuilder, { column, subscriptions }: { column: string; subscriptions: 'some' | 'none' | 'any' }): void {
    query.whereRaw("??->>'kind' = 'http'", [column]);

    if (subscriptions === 'any') {
        return;
    }

    query.whereRaw(
        `CASE
            WHEN jsonb_typeof(??->'subscriptions') = 'array'
            THEN jsonb_array_length(??->'subscriptions')
            ELSE 0
        END ${subscriptions === 'some' ? '>' : '='} 0`,
        [column, column]
    );
}
