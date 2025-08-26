import { NangoActionBase } from './action.js';
import { validateData } from './dataValidation.js';

import type { ValidateDataError } from './dataValidation.js';
import type { RawModel, SchemaMetadata, SchemaModel, StandardSchemaV1 } from './types.js';
import type { MaybePromise, NangoProps } from '@nangohq/types';

export const BASE_VARIANT = 'base';

export abstract class NangoSyncBase<
    TModels extends Record<string, SchemaModel> = never,
    TMetadata extends SchemaMetadata = never,
    TModelName extends keyof TModels = keyof TModels
> extends NangoActionBase<TMetadata> {
    public variant = BASE_VARIANT;
    protected models?: TModels;

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
    public async batchSend<TModel extends RawModel = StandardSchemaV1.InferOutput<TModels[TModelName]>>(
        results: TModel[],
        model: TModelName
    ): Promise<boolean | null> {
        return await this.batchSave(results, model);
    }

    public abstract batchSave<TModel extends RawModel = StandardSchemaV1.InferOutput<TModels[TModelName]>>(
        results: TModel[],
        model: TModelName
    ): MaybePromise<boolean>;

    public abstract batchDelete<TModel extends RawModel = StandardSchemaV1.InferOutput<TModels[TModelName]>>(
        results: (Pick<TModel, 'id'> & Partial<TModel>)[],
        model: TModelName
    ): MaybePromise<boolean>;

    public abstract batchUpdate<TModel extends RawModel = StandardSchemaV1.InferOutput<TModels[TModelName]>>(
        results: (Pick<TModel, 'id'> & Partial<TModel>)[],
        model: TModelName
    ): MaybePromise<boolean>;

    public abstract getRecordsByIds<TKey = string | number, TModel extends RawModel = StandardSchemaV1.InferOutput<TModels[TModelName]>>(
        ids: TKey[],
        model: TModelName
    ): MaybePromise<Map<TKey, TModel>>;

    public abstract setMergingStrategy(merging: { strategy: 'ignore_if_modified_after' | 'override' }, model: TModelName): Promise<void>;

    /**
     * Set the models for validation using StandardSchema
     * This is called by the runner when executing Zero YAML syncs
     */
    public setModels(models: TModels): void {
        this.models = models;
    }

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
