import Fuse from 'fuse.js';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { buttonVariants } from '@/components-v2/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components-v2/ui/dropdown-menu';
import { Input } from '@/components-v2/ui/input';
import { cn } from '@/utils/utils';

import type { ApiIntegrationList } from '@nangohq/types';

interface IntegrationDropdownProps {
    integrations: ApiIntegrationList[];
    selectedIntegration: ApiIntegrationList | undefined;
    onSelect: (integration: ApiIntegrationList | undefined) => void;
    loading: boolean;
    disabled?: boolean;
}

export const IntegrationDropdown: React.FC<IntegrationDropdownProps> = ({ integrations, selectedIntegration, onSelect, loading, disabled }) => {
    const [search, setSearch] = useState('');

    const fuse = useMemo(() => {
        if (!integrations || integrations.length === 0) {
            return null;
        }

        return new Fuse(integrations, {
            keys: [
                { name: 'display_name', weight: 0.4 },
                { name: 'meta.displayName', weight: 0.3 },
                { name: 'unique_key', weight: 0.3 }
            ],
            threshold: 0.4,
            includeScore: true,
            minMatchCharLength: 1,
            ignoreLocation: true,
            findAllMatches: true
        });
    }, [integrations]);

    const filteredIntegrations = useMemo(() => {
        if (!search.trim() || !fuse) {
            return integrations;
        }

        const results = fuse.search(search);
        return results.map((result) => result.item);
    }, [integrations, search, fuse]);

    return (
        <DropdownMenu modal={false}>
            <DropdownMenuTrigger
                className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'bg-bg-surface justify-between grow w-full h-13')}
                disabled={disabled}
            >
                {selectedIntegration ? (
                    <div className="flex gap-3 items-center">
                        <IntegrationLogo provider={selectedIntegration.provider} className="w-10 h-10" />{' '}
                        {selectedIntegration.display_name || selectedIntegration.meta.displayName}
                    </div>
                ) : (
                    'Choose from the list'
                )}
                <ChevronsUpDown className="size-4.5 text-text-secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="w-[var(--radix-dropdown-menu-trigger-width)] p-2 bg-bg-subtle border-none"
                side="bottom"
                align="start"
                onInteractOutside={(e) => {
                    // Prevent closing when interacting with the input
                    if (e.target instanceof Element && e.target.closest('input')) {
                        e.preventDefault();
                    }
                }}
            >
                <div
                    className="flex items-center gap-3 px-3 py-2.5 mb-2 bg-bg-muted rounded-md border border-grayscale-600"
                    onKeyDown={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <Search className="size-5 shrink-0 text-icon-disabled" />
                    <Input
                        placeholder="Github, accounting, oauth..."
                        className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 text-text-secondary h-auto p-0"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                    {loading ? (
                        <div className="py-6 text-center text-text-secondary">Loading integrations...</div>
                    ) : filteredIntegrations.length === 0 ? (
                        <div className="py-6 text-center text-text-secondary">No integrations found.</div>
                    ) : (
                        filteredIntegrations.map((item) => {
                            const isSelected = selectedIntegration?.unique_key === item.unique_key;
                            return (
                                <DropdownMenuItem
                                    key={item.unique_key}
                                    onSelect={() => {
                                        onSelect(isSelected ? undefined : item);
                                        setSearch('');
                                    }}
                                    className={cn('flex items-center justify-between cursor-pointer py-3 px-3 rounded-md', isSelected && 'bg-pure-black')}
                                >
                                    <div className="flex gap-3 items-center text-[15px]">
                                        <IntegrationLogo provider={item.provider} className="size-8" />
                                        {item.display_name || item.meta.displayName}
                                    </div>
                                    {isSelected && <Check className="size-5" />}
                                </DropdownMenuItem>
                            );
                        })
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
