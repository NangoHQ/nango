import Fuse from 'fuse.js';
import debounce from 'lodash/debounce';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { AuthBadge } from './components/AuthBadge';
import { AutoIdlingBanner } from './components/AutoIdlingBanner';
import { ErrorPageComponent } from '@/components/ErrorComponent';
import { CopyButton } from '@/components-v2/CopyButton';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { ButtonLink } from '@/components-v2/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { useListIntegration } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';

import type { ApiIntegrationList } from '@nangohq/types';

export const IntegrationsList = () => {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);
    const { list, loading, error } = useListIntegration(env);
    const [integrations, setIntegrations] = useState<ApiIntegrationList[] | null>(null);

    const initialIntegrations = useMemo(() => {
        return list ?? null;
    }, [list]);

    useEffect(() => {
        if (initialIntegrations) {
            setIntegrations(initialIntegrations);
        }
    }, [initialIntegrations]);

    const fuse = useMemo(() => {
        if (!initialIntegrations || initialIntegrations.length === 0) {
            return null;
        }

        return new Fuse(initialIntegrations, {
            keys: [
                { name: 'meta.displayName', weight: 0.3 },
                { name: 'provider', weight: 0.3 },
                { name: 'unique_key', weight: 0.2 },
                { name: 'meta.authMode', weight: 0.2 }
            ],
            threshold: 0.4, // 0.0 = exact match, 1.0 = match anything. 0.4 is a good balance
            includeScore: true,
            minMatchCharLength: 1,
            ignoreLocation: true, // Search anywhere in the string
            findAllMatches: true // Find all matches, not just the first
        });
    }, [initialIntegrations]);

    const filterIntegrations = useCallback(
        (value: string) => {
            if (!value.trim() || !fuse) {
                setIntegrations(initialIntegrations);
                return;
            }

            const results = fuse.search(value);
            const filtered = results.map((result) => result.item);
            setIntegrations(filtered);
        },
        [initialIntegrations, fuse]
    );

    const debouncedFilterIntegrations = useMemo(() => debounce(filterIntegrations, 300), [filterIntegrations]);

    useEffect(() => {
        return () => {
            debouncedFilterIntegrations.cancel();
        };
    }, [debouncedFilterIntegrations]);

    const handleInputChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
            debouncedFilterIntegrations(event.currentTarget.value);
        },
        [debouncedFilterIntegrations]
    );

    if (error) {
        return <ErrorPageComponent title="Integrations" error={error.json} />;
    }

    return (
        <DashboardLayout fullWidth className="flex flex-col gap-8">
            <Helmet>
                <title>Integrations - Nango</title>
            </Helmet>
            <header className="flex justify-between items-center">
                <h2 className="text-text-primary text-title-subsection">Integrations</h2>
                <ButtonLink to={`/${env}/integrations/create`} size="lg">
                    Set up new integration
                </ButtonLink>
            </header>

            <InputGroup className="bg-bg-subtle">
                <InputGroupInput type="text" placeholder="Search integration" onChange={handleInputChange} autoFocus />
                <InputGroupAddon>
                    <Search />
                </InputGroupAddon>
            </InputGroup>

            <AutoIdlingBanner />

            {loading && (
                <div className="flex flex-col gap-1">
                    <Skeleton className="h-10 w-full" />
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton className="h-13 w-full" key={index} />
                    ))}
                </div>
            )}

            {list && list.length === 0 && (
                <div className="flex flex-col gap-5 p-20 items-center justify-center bg-bg-elevated rounded">
                    <h3 className="text-title-body text-text-primary">No available integrations</h3>
                    <p className="text-text-secondary text-body-medium-regular">You don’t have any integrations set up yet with Nango.</p>
                    <ButtonLink to={`/${env}/integrations/create`} size="lg">
                        Set up new integration
                    </ButtonLink>
                </div>
            )}

            {list && list.length > 0 && integrations && integrations.length === 0 && (
                <div className="flex flex-col gap-5 p-20 items-center justify-center bg-bg-elevated rounded">
                    <h3 className="text-title-body text-text-primary">No integrations found</h3>
                    <p className="text-text-secondary text-body-medium-regular">Could not find any integrations matching your search.</p>
                    <ButtonLink to={`/${env}/integrations/create`} size="lg">
                        Set up new integration
                    </ButtonLink>
                </div>
            )}

            {integrations && integrations.length > 0 && (
                <Table>
                    <TableHeader className="h-11">
                        <TableRow>
                            <TableHead className="w-4/12">Name</TableHead>
                            <TableHead className="w-3/12">ID</TableHead>
                            <TableHead className="w-3/12 text-center">Connections</TableHead>
                            <TableHead className="w-2/12">Auth Type</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {integrations.map((integration) => (
                            <TableRow
                                key={integration.unique_key}
                                className="h-14 cursor-pointer"
                                onClick={() => {
                                    navigate(`/${env}/integrations/${integration.unique_key}`);
                                }}
                            >
                                <TableCell className="text-text-primary text-body-small-semi">
                                    <div className="flex gap-1.5 items-center">
                                        <IntegrationLogo provider={integration.provider} />
                                        {integration.display_name || integration.meta.displayName}
                                    </div>
                                </TableCell>
                                <TableCell className="text-text-secondary !text-body-small-regular">
                                    <div className="flex gap-1.5 items-center">
                                        {integration.unique_key}
                                        <CopyButton text={integration.unique_key} />
                                    </div>
                                </TableCell>
                                <TableCell className="text-text-primary text-body-small-semi text-center">{integration.meta.connectionCount}</TableCell>
                                <TableCell>
                                    <AuthBadge authMode={integration.meta.authMode} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </DashboardLayout>
    );
};
