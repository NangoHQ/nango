export interface NangoSync {
    get: (id: any) => Promise<any>;
    batchSave: (data: any[], model: string) => Promise<any>;
}
