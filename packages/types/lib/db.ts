export interface Timestamps {
    created_at: Date;
    updated_at: Date;
}

export interface Deleted {
    deleted_at?: Date | null;
    deleted?: boolean;
}
export interface DeletedCorrect {
    deleted_at: Date | null;
    deleted: boolean;
}

export interface TimestampsAndDeleted extends Timestamps, Deleted {}
export interface TimestampsAndDeletedCorrect extends Timestamps, DeletedCorrect {}
