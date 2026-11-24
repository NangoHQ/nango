import type { FunctionTagValue, ToolTags } from '@nangohq/types';

export const TAGS_META_KEY = 'nango/tags' as const;

export type ClientToolTags = Record<string, FunctionTagValue>;

/** required_scopes is what Nango checks a connection against, not a tag the tool's author set for clients. */
export function clientToolTags(tags: ToolTags | undefined): ClientToolTags | undefined {
    const entries = Object.entries(tags ?? {}).filter((entry): entry is [string, FunctionTagValue] => entry[0] !== 'required_scopes');
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}
