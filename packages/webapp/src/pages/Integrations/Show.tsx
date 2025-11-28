import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';

import { AuthBadge } from './components/AuthBadge';
import { AutoIdlingBanner } from './components/AutoIdlingBanner';
import { ErrorPageComponent } from '@/components/ErrorComponent';
import { CopyButton } from '@/components-v2/CopyButton';
import { IntegrationLogo } from '@/components-v2/IntegrationLogo';
import { ButtonLink } from '@/components-v2/ui/button';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components-v2/ui/table';
import { useListIntegration } from '@/hooks/useIntegration';
import DashboardLayout from '@/layout/DashboardLayout';
import { useStore } from '@/store';

export const IntegrationsList = () => {
    const navigate = useNavigate();

    const env = useStore((state) => state.env);
    const { list, loading, error } = useListIntegration(env);

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

            {list && list.length > 0 && (
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
                        {list.map((integration) => (
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
