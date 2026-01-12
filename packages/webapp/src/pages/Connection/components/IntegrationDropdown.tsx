import { IconCheck, IconChevronDown, IconSearch } from '@tabler/icons-react';
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

    const filteredIntegrations = useMemo(() => {
        if (!search) {
            return integrations;
        }
        return integrations.filter((integration) => {
            return (
                integration.display_name?.toLowerCase().includes(search.toLowerCase()) ||
                integration.meta.displayName?.toLowerCase().includes(search.toLowerCase()) ||
                integration.unique_key?.toLowerCase().includes(search.toLowerCase())
            );
        });
    }, [integrations, search]);

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
                <IconChevronDown stroke={1} size={18} className="text-text-secondary" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="w-[var(--radix-dropdown-menu-trigger-width)] p-2"
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
                    className="flex items-center px-2 pb-2 border-b border-border-muted mb-2"
                    onKeyDown={(e) => {
                        e.stopPropagation();
                    }}
                >
                    <IconSearch className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <Input
                        placeholder="Search integrations..."
                        className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-text-placeholder disabled:cursor-not-allowed disabled:opacity-50 border-none focus-visible:ring-0 px-0"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                    {loading ? (
                        <div className="py-6 text-center text-sm text-text-secondary">Loading integrations...</div>
                    ) : filteredIntegrations.length === 0 ? (
                        <div className="py-6 text-center text-sm text-text-secondary">No integrations found.</div>
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
                                    className="flex items-center justify-between cursor-pointer"
                                >
                                    <div className="flex gap-3 items-center">
                                        <IntegrationLogo provider={item.provider} className="w-5 h-5" />
                                        {item.display_name || item.meta.displayName}
                                    </div>
                                    {isSelected && <IconCheck className="h-4 w-4" />}
                                </DropdownMenuItem>
                            );
                        })
                    )}
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
