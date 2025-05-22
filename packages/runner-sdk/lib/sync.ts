import { NangoActionBase } from './action.js';
import { validateData } from './dataValidation.js';

import type { ValidateDataError } from './dataValidation.js';
import type { MaybePromise, NangoProps } from '@nangohq/types';
import type { z } from 'zod';

export const BASE_VARIANT = 'base';

export abstract class NangoSyncBase<
    TModels extends Record<string, Zod.ZodObject<any>> = never,
    TMetadata extends Zod.ZodObject<any> | undefined = never,
    TModelName extends keyof TModels = keyof TModels
> extends NangoActionBase<TMetadata> {
    public variant = BASE_VARIANT;

    lastSyncDate?: Date;
    track_deletes = false;

    constructor(config: NangoProps) {
        super(config);

        if (config.lastSyncDate) {
            this.lastSyncDate = config.lastSyncDate;
        }

        if (config.track_deletes) {
            this.track_deletes = config.track_deletes;
        }

        if (config.syncVariant) {
            this.variant = config.syncVariant;
        }
    }

    public modelFullName(model: string) {
        if (this.variant === BASE_VARIANT) {
            return model;
        }
        return `${model}::${this.variant}`;
    }

    /**
     * @deprecated please use batchSave
     */
    public async batchSend(results: z.infer<TModels[TModelName]>[], model: TModelName): Promise<boolean | null> {
        return this.batchSave(results, model);
    }

    public abstract batchSave(results: z.infer<TModels[TModelName]>[], model: TModelName): MaybePromise<boolean>;

    public abstract batchDelete(results: z.infer<TModels[TModelName]>[], model: TModelName): MaybePromise<boolean>;

    public abstract batchUpdate(results: z.infer<TModels[TModelName]>[], model: TModelName): MaybePromise<boolean>;

    public abstract getRecordsByIds<K = string | number, T = any>(ids: K[], model: TModelName): MaybePromise<Map<K, T>>;

    public abstract setMergingStrategy(merging: { strategy: 'ignore_if_modified_after' | 'override' }, model: string): Promise<void>;

    protected validateRecords(model: string, records: unknown[]): { data: any; validation: ValidateDataError[] }[] {
        // Validate records
        const hasErrors: { data: any; validation: ValidateDataError[] }[] = [];
        for (const record of records) {
            const validation = validateData({
                version: this.syncConfig?.version || '1',
                input: JSON.parse(JSON.stringify(record)),
                jsonSchema: this.syncConfig!.models_json_schema,
                modelName: model
            });
            if (validation === true) {
                continue;
            }

            hasErrors.push({ data: record, validation });

            if (this.runnerFlags?.validateSyncRecords) {
                break;
            }
        }

        return hasErrors;
    }

    protected removeMetadata<T extends object>(results: T[]) {
        if (!Array.isArray(results)) {
            return results;
        }
        return results.map((result) => {
            if (result && typeof result === 'object' && '_nango_metadata' in result) {
                delete result._nango_metadata;
            }

            return result;
        });
    }
}
