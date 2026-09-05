export const serverRequestSizeLimit = '10mb';

// The scheduler resolves these names in a single `IN` clause, so callers chunk to this rather than raising it.
export const maxScheduleNamesPerSearch = 1000;
