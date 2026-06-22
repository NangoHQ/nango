export const RECORDS_TABLE = 'records';
export const RECORD_COUNTS_TABLE = 'record_counts';
export const RECORDS_DATA_TABLE = 'records_data';
export const RECORDS_SEEN_TABLE = 'records_seen';
export const RECORDS_ROUTING_TABLE = 'records_routing';

export const DEFAULT_RECORDS_LIMIT = 100;

// Max number of record ids packed into a single records_seen row.
// PostgreSQL pushes a tuple into TOAST storage once it exceeds ~2KB.
// record_ids is a uuid[], so capping at 100 ids (~1.6KB for the array) keeps the whole row
// comfortably inline and untoasted.
export const RECORDS_SEEN_MAX_IDS_PER_ROW = 100;
