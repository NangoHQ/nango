type Metadata = Record<string, any>;

export interface SharePointMetadata extends Metadata {
    sitesToSync: string[];
    syncedSites?: { id: string; listId: string; deltaToken?: string }[];
}
