import { ListFilter } from 'lucide-react';
import { useState } from 'react';

import { FilterSelect } from '@/components/patterns/FilterSelect';

import type { FilterSelectGroupData } from '@/components/patterns/FilterSelect';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta: Meta = {
    title: 'Components/Patterns/FilterSelect',
    parameters: { layout: 'centered' }
};
export default meta;
type Story = StoryObj<typeof meta>;

const GROUPS = [
    { value: 'integration', label: 'Integration' },
    { value: 'connection', label: 'Connection' },
    { value: 'status', label: 'Status' },
    { value: 'function', label: 'Function name' }
];

// Static options per group. `connection` shows full UUIDs (width-fit), `function` is long
// enough to scroll (auto-height cap), `status` is a short semantic pair.
const DATA: Record<string, { value: string; label: string }[]> = {
    integration: ['google-calendar', 'algolia', 'unauthenticated', 'twitter-v2', 'github-getting-started'].map((v) => ({ value: v, label: v })),
    connection: [
        'a42cf515-6bd4-4c1f-9389-b4ccd1ab9ce4',
        'b9e58975-4dc5-4243-8feb-07ce377532da',
        'c14fad81-ccd2-4479-be64-3174e3fc3a15',
        '78f14123-3d01-49a5-8e5e-825dea272e53'
    ].map((v) => ({ value: v, label: v })),
    status: [
        { value: 'true', label: 'Success' },
        { value: 'false', label: 'Failed' }
    ],
    function: [
        'settings',
        'get-me',
        'me',
        'busy-me',
        'list-monthly-events',
        'get-issue',
        'create-event',
        'delete-event',
        'update-event',
        'list-calendars',
        'get-availability',
        'watch-channel'
    ].map((v) => ({ value: v, label: v }))
};

// A long list to demonstrate paging — far more than fits without scrolling.
const MANY = Array.from({ length: 60 }, (_, i) => {
    const v = `conn-${String(i + 1).padStart(2, '0')}`;
    return { value: v, label: v };
});

// Serves MANY in pages of 20, with a brief simulated delay on each load so the next-page spinner
// shows. Lives in FilterSelect's value pane (which remounts per group), so the page count resets
// each time the group reopens. Named `use*` because it holds hook state.
const usePaginatingGroupData = (_group: string): FilterSelectGroupData => {
    const PAGE = 20;
    const [loaded, setLoaded] = useState(PAGE);
    const [fetchingNext, setFetchingNext] = useState(false);
    return {
        options: MANY.slice(0, loaded),
        isLoading: false,
        isError: false,
        hasNextPage: loaded < MANY.length,
        isFetchingNextPage: fetchingNext,
        fetchNextPage: () => {
            if (fetchingNext || loaded >= MANY.length) return;
            setFetchingNext(true);
            setTimeout(() => {
                setLoaded((n) => Math.min(n + PAGE, MANY.length));
                setFetchingNext(false);
            }, 500);
        }
    };
};

const Demo: React.FC<{
    initial?: { group: string; value: string } | null;
    groups?: { value: string; label: string }[];
    useGroupData?: (group: string) => FilterSelectGroupData;
}> = ({ initial = null, groups = GROUPS, useGroupData }) => {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState<{ group: string; value: string } | null>(initial);

    // In the app this fetches per-dimension values; here it's static unless a story overrides it.
    const defaultUseGroupData = (group: string): FilterSelectGroupData => ({ options: DATA[group] ?? [], isLoading: false, isError: false });

    const activeLabel = filter ? `${groups.find((g) => g.value === filter.group)?.label}: ${filter.value}` : 'Filter';
    const trigger = (
        <button
            type="button"
            className="flex h-7 w-fit items-center gap-1.5 rounded border border-border-muted bg-surface-overlay px-1.5 text-s whitespace-nowrap text-text-secondary hover:bg-state-hover"
        >
            <ListFilter className="size-3.5 shrink-0 text-text-muted" />
            <span className={filter ? 'max-w-[220px] truncate text-text-strong' : undefined}>{activeLabel}</span>
        </button>
    );

    return (
        <FilterSelect
            trigger={trigger}
            open={open}
            onOpenChange={setOpen}
            groups={groups}
            useGroupData={useGroupData ?? defaultUseGroupData}
            selectedValueFor={(g: string) => (filter?.group === g ? filter.value : null)}
            onSelect={(group: string, value: string) => setFilter({ group, value })}
            // `status` is a fixed set: no free text and no search box — the others allow both.
            allowCreate={(g: string) => g !== 'status'}
            searchable={(g: string) => g !== 'status'}
        />
    );
};

export const Default: Story = {
    render: () => <Demo />
};

export const WithSelection: Story = {
    name: 'With a selection',
    render: () => <Demo initial={{ group: 'status', value: 'true' }} />
};

export const Paginating: Story = {
    name: 'Paging (load more on scroll)',
    render: () => <Demo groups={[{ value: 'connection', label: 'Connection' }]} useGroupData={usePaginatingGroupData} />
};

export const Loading: Story = {
    name: 'Loading values',
    render: () => <Demo groups={[{ value: 'function', label: 'Function name' }]} useGroupData={() => ({ options: [], isLoading: true, isError: false })} />
};

export const Searching: Story = {
    name: 'Search fetch in flight',
    render: () => (
        <Demo
            groups={[{ value: 'function', label: 'Function name' }]}
            useGroupData={(group) => ({ options: DATA[group] ?? [], isLoading: false, isFetching: true, isError: false })}
        />
    )
};
