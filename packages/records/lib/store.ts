import type { CombinedFilterAction, FormattedRecord, GetRecordsResponse, LastAction, RecordCount, UpsertSummary } from './types.js';
import type { CursorOffset, MergingStrategy } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export interface RecordsStore {
    migrate: () => Promise<void>;
    close: () => Promise<void>;
    startDaemons: () => void;

    getRecords: ({
        connectionId,
        model,
        modifiedAfter,
        limit,
        filter,
        cursor,
        externalIds
    }: {
        connectionId: number;
        model: string;
        modifiedAfter?: string | undefined;
        limit?: number | undefined;
        filter?: CombinedFilterAction | LastAction | undefined;
        cursor?: string | undefined;
        externalIds?: string[] | undefined;
    }) => Promise<Result<GetRecordsResponse>>;

    getCursor: ({ connectionId, model, offset }: { connectionId: number; model: string; offset: CursorOffset }) => Promise<Result<string | undefined>>;

    upsert: ({
        records,
        connectionId,
        environmentId,
        model,
        softDelete,
        merging
    }: {
        records: FormattedRecord[];
        connectionId: number;
        environmentId: number;
        model: string;
        softDelete?: boolean;
        merging?: MergingStrategy;
    }) => Promise<Result<UpsertSummary>>;

    update: ({
        records,
        environmentId,
        connectionId,
        model,
        merging
    }: {
        records: FormattedRecord[];
        connectionId: number;
        environmentId: number;
        model: string;
        merging?: MergingStrategy;
    }) => Promise<Result<UpsertSummary>>;

    deleteRecords: ({
        connectionId,
        environmentId,
        model,
        mode,
        limit,
        toCursorIncluded,
        batchSize,
        dryRun
    }: {
        connectionId: number;
        environmentId: number;
        model: string;
        mode: 'hard' | 'soft' | 'prune';
        limit?: number;
        toCursorIncluded?: string;
        batchSize?: number;
        dryRun?: boolean;
    }) => Promise<Result<{ count: number; lastCursor: string | null }>>;

    deleteOutdatedRecords: ({
        environmentId,
        connectionId,
        model,
        generation,
        batchSize
    }: {
        environmentId: number;
        connectionId: number;
        model: string;
        generation: number;
        batchSize?: number;
    }) => Promise<Result<string[]>>;

    getCountsByModel: ({ connectionId, environmentId }: { connectionId: number; environmentId: number }) => Promise<Result<Record<string, RecordCount>>>;

    paginateCounts: (params?: { connectionIds?: number[]; environmentIds?: number[]; batchSize?: number }) => AsyncGenerator<Result<RecordCount[]>>;

    autoPruningCandidate: ({ staleAfterMs }: { staleAfterMs: number }) => Promise<
        Result<{
            partition: number;
            environmentId: number;
            connectionId: number;
            model: string;
            cursor: string;
        } | null>
    >;

    autoDeletingCandidate: ({ staleAfterMs }: { staleAfterMs: number }) => Promise<
        Result<{
            connectionId: number;
            model: string;
            environmentId: number;
        } | null>
    >;
}
