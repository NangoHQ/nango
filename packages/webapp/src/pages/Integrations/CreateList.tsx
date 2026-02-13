import { useVirtualizer } from '@tanstack/react-virtual';
import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { AuthBadge } from './components/AuthBadge.js';
import { useProviders } from '../../hooks/useProviders.js';
import DashboardLayout from '../../layout/DashboardLayout.js';
import { useStore } from '../../store.js';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { Badge } from '@/components-v2/ui/badge';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton.js';

import type { ApiProviderListItem } from '@nangohq/types';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';

type Provider = ApiProviderListItem;

export const CreateIntegrationList = () => {
    const env = useStore((state) => state.env);

    const { data: providersData, isLoading: loadingProviders } = useProviders(env);
    const [providers, setProviders] = useState<Provider[] | null>(null);

    const navigate = useNavigate();

    const initialProviders = useMemo(() => {
        return providersData?.data ?? null;
    }, [providersData]);

    useEffect(() => {
        if (initialProviders) {
            setProviders(initialProviders);
        }
    }, [initialProviders]);

    const fuse = useMemo(() => {
        if (!initialProviders || initialProviders.length === 0) {
            return null;
        }

        return new Fuse(initialProviders, {
            keys: [
                { name: 'displayName', weight: 0.3 },
                { name: 'name', weight: 0.3 },
                { name: 'authMode', weight: 0.2 },
                { name: 'categories', weight: 0.2 }
            ],
            threshold: 0.4, // 0.0 = exact match, 1.0 = match anything. 0.4 is a good balance
            includeScore: true,
            minMatchCharLength: 1,
            ignoreLocation: true, // Search anywhere in the string
            findAllMatches: true // Find all matches, not just the first
        });
    }, [initialProviders]);

    const filterProviders = useCallback(
        (value: string) => {
            if (!value.trim() || !fuse) {
                setProviders(initialProviders);
                return;
            }

            const results = fuse.search(value);
            const filtered = results.map((result) => result.item);

            setProviders(filtered);
        },
        [initialProviders, fuse]
    );

    const debouncedFilterProviders = useMemo(() => debounce(filterProviders, 300), [filterProviders]);

    useEffect(() => {
        return () => {
            debouncedFilterProviders.cancel();
        };
    }, [debouncedFilterProviders]);

    const handleInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
            debouncedFilterProviders(event.currentTarget.value);
        },
        [debouncedFilterProviders]
    );

    const onSelectProvider = (provider: Provider) => {
        navigate(`/${env}/integrations/create/${provider.name}`);
    };

    return (
        <DashboardLayout fullWidth className="flex flex-col gap-8">
            <Helmet>
                <title>Create integration - Nango</title>
            </Helmet>

            <header>
                <h2 className="text-text-primary text-title-subsection">Set up new integration</h2>
            </header>

            <InputGroup className="bg-bg-subtle">
                <InputGroupInput type="text" placeholder="Github, accounting, oauth..." onChange={handleInputChange} autoFocus />
                <InputGroupAddon>
                    <Search />
                </InputGroupAddon>
            </InputGroup>

            <ProviderList providers={providers ?? initialProviders} onSelectProvider={onSelectProvider} loading={loadingProviders} />
        </DashboardLayout>
    );
};

interface ProviderListProps {
    providers: Provider[] | null;
    onSelectProvider: (provider: Provider) => void;
    loading: boolean;
}

const ProviderList = ({ providers, onSelectProvider, loading }: ProviderListProps) => {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
        count: providers?.length ?? 0,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 74,
        overscan: 5,
        gap: 8
    });

    if (loading) {
        return (
            <div className="flex flex-col gap-2">
                {Array.from({ length: 10 }).map((_, index) => (
                    <Skeleton key={index} className="h-16.5 w-full" />
                ))}
            </div>
        );
    }

    if (!providers || providers.length === 0) {
        return (
            <div className="flex flex-col gap-5 p-20 items-center justify-center bg-bg-elevated rounded">
                <p className="text-text-secondary text-body-medium-regular">Could not find any integrations matching your search.</p>
            </div>
        );
    }

    return (
        <div ref={parentRef} className="h-full overflow-auto">
            <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const provider = providers[virtualRow.index];
                    return (
                        <Provider
                            key={virtualRow.key}
                            provider={provider}
                            onClick={() => onSelectProvider(provider)}
                            virtualRow={virtualRow}
                            rowVirtualizer={rowVirtualizer}
                        />
                    );
                })}
            </div>
        </div>
    );
};

const Provider = ({
    provider,
    onClick,
    virtualRow,
    rowVirtualizer
}: {
    provider: Provider;
    onClick: () => void;
    virtualRow?: VirtualItem;
    rowVirtualizer?: Virtualizer<HTMLDivElement, HTMLDivElement>;
}) => {
    return (
        <div
            onClick={onClick}
            className="p-4 w-full inline-flex items-center justify-between bg-bg-elevated rounded border border-transparent cursor-pointer transition-colors hover:bg-bg-surface hover:border-border-disabled"
            data-index={virtualRow?.index}
            ref={rowVirtualizer ? (node) => rowVirtualizer.measureElement(node) : undefined}
            style={
                virtualRow
                    ? {
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`
                      }
                    : undefined
            }
        >
            <div className="inline-flex gap-1.5 items-center">
                <IntegrationLogo provider={provider.name} />
                <span className="text-text-primary text-body-medium-semi">{provider.displayName}</span>
            </div>
            <div className="inline-flex gap-1.5 items-center justify-end">
                <AuthBadge authMode={provider.authMode} />
                {provider.categories?.map((category) => (
                    <Badge key={category} variant="ghost">
                        {category}
                    </Badge>
                ))}
            </div>
        </div>
    );
};
