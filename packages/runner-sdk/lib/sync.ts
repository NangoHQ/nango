import type { MaybePromise, NangoProps } from '@nangohq/types';
import { validateData } from './dataValidation.js';
import type { ValidateDataError } from './dataValidation.js';
import { NangoActionBase } from './action.js';

export abstract class NangoSyncBase extends NangoActionBase {
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
    }

    /**
     * @deprecated please use batchSave
     */
    public async batchSend<T extends object>(results: T[], model: string): Promise<boolean | null> {
        return this.batchSave(results, model);
    }

    public abstract batchSave<T extends object>(results: T[], model: string): MaybePromise<boolean>;

    public abstract batchDelete<T extends object>(results: T[], model: string): MaybePromise<boolean>;

    public abstract batchUpdate<T extends object>(results: T[], model: string): MaybePromise<boolean>;

    public abstract getRecordsByIds<K = string | number, T = any>(ids: K[], model: string): MaybePromise<Map<K, T>>;

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
        return results.map((result) => {
            if ('_nango_metadata' in result) {
                delete result._nango_metadata;
            }

            return result;
        });
    }
}
