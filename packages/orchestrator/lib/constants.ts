export const serverRequestSizeLimit = '10mb';

// The scheduler resolves these names in a single `IN` clause, so callers chunk to this rather than raising it.
export const maxScheduleNamesPerSearch = 1000;

export const INLINE_FUNCTION_UUID = '00000000-0000-0000-0000-000000000000';

export const maxInlineSourceCodeLength = 8192;
