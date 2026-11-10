import { ArrowUpRight, Search, X } from 'lucide-react';

import { Button } from '@nangohq/design-system';

const REQUEST_API_URL = 'https://nango.dev/docs/integrations/contribute-or-request-api';

export interface ActiveFilter {
    key: string;
    label: string;
    value: string;
    onRemove: () => void;
}

export const NoMatchesState: React.FC<{ filters: ActiveFilter[]; onClearAll: () => void }> = ({ filters, onClearAll }) => (
    <div className="flex flex-col items-center gap-3 rounded-ds-md border-ds-hairline border-border-default bg-surface-panel px-6 py-14 text-center">
        <span className="flex size-10 items-center justify-center rounded-ds-md border-ds-hairline border-border-default bg-surface-panel-inset">
            <Search className="size-5 text-icon-secondary" />
        </span>
        <span className="type-text-medium-md text-text-strong">No APIs match these filters</span>
        {filters.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
                {filters.map((filter) => (
                    <button
                        key={filter.key}
                        type="button"
                        onClick={filter.onRemove}
                        aria-label={`Remove ${filter.label.toLowerCase()} filter ${filter.value}`}
                        className="flex h-6 cursor-pointer items-center gap-1.5 rounded-ds-sm border-ds-hairline border-border-default bg-surface-canvas px-2 type-text-regular-xs text-text-muted transition-colors hover:border-border-strong focus-default"
                    >
                        {filter.label}
                        <span className="type-text-medium-xs text-text-strong">{filter.value}</span>
                        <X className="size-3 text-icon-secondary" />
                    </button>
                ))}
            </div>
        )}
        <span className="max-w-md type-text-regular-sm text-text-secondary">
            Remove a filter, or check the spelling. Missing an API? Nango can add it, or you can build your own integration.
        </span>
        <div className="flex items-center gap-4">
            <Button variant="link-accent" size="sm" onClick={onClearAll}>
                Clear all filters
            </Button>
            <Button asChild variant="link-accent" size="sm">
                <a href={REQUEST_API_URL} target="_blank" rel="noreferrer">
                    Build your own <ArrowUpRight />
                </a>
            </Button>
        </div>
    </div>
);
