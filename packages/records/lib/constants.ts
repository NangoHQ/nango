export const RECORDS_TABLE = 'records';
export const RECORD_COUNTS_TABLE = 'record_counts';
export const RECORDS_DATA_TABLE = 'records_data';
export const RECORDS_SEEN_TABLE = 'records_seen';

// Default page size for getRecords when the caller doesn't pass `limit`.
// The query asks for DEFAULT_RECORDS_LIMIT + 1 to detect "has more pages".
export const DEFAULT_RECORDS_LIMIT = 100;
