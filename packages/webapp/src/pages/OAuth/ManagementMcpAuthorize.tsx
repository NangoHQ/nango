import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleX, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';

import { Alert, AlertDescription, Badge, Button } from '@nangohq/design-system';

import { ComboboxSelect } from '@/components/ui/Combobox';
import DefaultLayout from '@/layout/DefaultLayout';
import { APIError, apiFetch } from '@/utils/api';

interface InteractionDetails {
    client: { name: string; uri: string | null; redirectHost: string };
    account: { name: string };
    environments: { id: number; name: string; isProduction: boolean }[];
    scope: string;
    csrfToken: string;
}

interface InteractionResult {
    redirectTo: string;
}

export const ManagementMcpAuthorize: React.FC = () => {
    const [searchParams] = useSearchParams();
    const interaction = searchParams.get('interaction');
    const [selectedEnvironmentIds, setSelectedEnvironmentIds] = useState<string[]>([]);

    const details = useQuery<InteractionDetails, APIError>({
        queryKey: ['management-mcp-oauth', interaction],
        enabled: Boolean(interaction),
        retry: false,
        queryFn: async () => {
            const response = await apiFetch(`/oauth/management-mcp/interaction/${encodeURIComponent(requireValue(interaction, 'Missing OAuth interaction'))}`);
            const json = (await response.json()) as InteractionDetails | { error: { message: string } };
            if (!response.ok || 'error' in json) {
                throw new APIError({ res: response, json });
            }
            return json;
        }
    });

    const approve = useMutation<InteractionResult, APIError>({
        mutationFn: async () => {
            const interactionId = requireValue(interaction, 'Missing OAuth interaction');
            const interactionDetails = requireValue(details.data, 'Missing OAuth interaction details');
            const response = await apiFetch(`/oauth/management-mcp/interaction/${encodeURIComponent(interactionId)}/approve`, {
                method: 'POST',
                body: JSON.stringify({
                    csrfToken: interactionDetails.csrfToken,
                    environmentIds: selectedEnvironmentIds.map(Number)
                })
            });
            const json = (await response.json()) as InteractionResult | { error: { message: string } };
            if (!response.ok || 'error' in json) {
                throw new APIError({ res: response, json });
            }
            return json;
        },
        onSuccess: ({ redirectTo }) => window.location.assign(redirectTo)
    });

    const deny = useMutation<InteractionResult, APIError>({
        mutationFn: async () => {
            const interactionId = requireValue(interaction, 'Missing OAuth interaction');
            const interactionDetails = requireValue(details.data, 'Missing OAuth interaction details');
            const response = await apiFetch(`/oauth/management-mcp/interaction/${encodeURIComponent(interactionId)}/deny`, {
                method: 'POST',
                body: JSON.stringify({ csrfToken: interactionDetails.csrfToken })
            });
            const json = (await response.json()) as InteractionResult | { error: { message: string } };
            if (!response.ok || 'error' in json) {
                throw new APIError({ res: response, json });
            }
            return json;
        },
        onSuccess: ({ redirectTo }) => window.location.assign(redirectTo)
    });

    const error = details.error ?? approve.error ?? deny.error;
    const errorMessage = !interaction
        ? 'The authorization request is missing its interaction identifier.'
        : error instanceof APIError
          ? ((error.json as { error?: { message?: string } }).error?.message ?? 'The authorization request is no longer available.')
          : error
            ? 'The authorization request could not be completed.'
            : null;

    return (
        <DefaultLayout className="gap-8">
            <Helmet>
                <title>Authorize MCP access - Nango</title>
            </Helmet>

            <div className="flex flex-col items-center gap-3 text-center">
                <div className="size-10 flex items-center justify-center rounded border border-border-muted bg-surface-canvas text-text-strong">
                    <ShieldCheck className="size-5" />
                </div>
                <div className="flex flex-col gap-1">
                    <h2 className="text-title-group text-text-strong">Authorize {details.data?.client.name ?? 'MCP client'}</h2>
                    <p className="text-body-medium-regular text-text-muted">
                        Connect to Nango Management MCP for {details.data?.account.name ?? 'your account'}.
                    </p>
                </div>
            </div>

            {errorMessage && (
                <Alert variant="danger">
                    <CircleX />
                    <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
            )}

            {details.data && (
                <div className="flex flex-col gap-6 w-full">
                    <div className="flex items-start gap-3">
                        <LockKeyhole className="size-4 mt-0.5 shrink-0 text-text-muted" />
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-body-medium-semi text-text-strong">Manage selected environments</span>
                            <span className="text-body-small-regular text-text-muted break-words">
                                This client can perform the same Management MCP operations that your current Nango role allows. This authorization returns to{' '}
                                {details.data.client.redirectHost}. Environments not selected here remain unavailable to this client.
                            </span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className="text-body-medium-semi text-text-strong">Environments</span>
                        <div className="w-full">
                            <ComboboxSelect
                                allowMultiple
                                label="Select environments"
                                dropdownTitle="Authorized environments"
                                options={details.data.environments.map((environment) => ({
                                    value: String(environment.id),
                                    label: environment.name,
                                    filterValue: environment.name,
                                    tag: environment.isProduction ? <Badge variant="brand">Production</Badge> : undefined
                                }))}
                                selected={selectedEnvironmentIds}
                                onSelectedChange={setSelectedEnvironmentIds}
                                onClearAll={() => setSelectedEnvironmentIds([])}
                                emptyText="No accessible environments"
                                className="w-full justify-between"
                                contentClassName="w-full"
                            />
                        </div>
                        <span className="text-body-small-regular text-text-muted">Adding another environment later requires a new authorization.</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" size="lg" onClick={() => deny.mutate()} loading={deny.isPending} disabled={approve.isPending}>
                            Deny
                        </Button>
                        <Button
                            variant="primary"
                            size="lg"
                            onClick={() => approve.mutate()}
                            loading={approve.isPending}
                            disabled={deny.isPending || selectedEnvironmentIds.length === 0}
                        >
                            Authorize
                        </Button>
                    </div>
                </div>
            )}
        </DefaultLayout>
    );
};

function requireValue<T>(value: T | null | undefined, message: string): T {
    if (value === null || value === undefined) {
        throw new Error(message);
    }
    return value;
}
