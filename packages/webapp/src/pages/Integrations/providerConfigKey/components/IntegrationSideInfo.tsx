import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CopyButton } from '@/components-v2/CopyButton';
import { useApiStatus } from '@/hooks/useApiStatus';
import { StatusWidget } from '@/pages/Integrations/components/StatusWidget';
import { getDisplayName } from '@/pages/Integrations/utils';
import { useStore } from '@/store';

import type { ApiIntegration, Provider } from '@nangohq/types';

export const IntegrationSideInfo: React.FC<{ integration: ApiIntegration; provider: Provider }> = ({ integration, provider }) => {
    const env = useStore((state) => state.env);
    const { data: apiStatus } = useApiStatus(integration.provider, env);

    return (
        <div className="flex flex-col min-w-30 w-60">
            <InfoRow label="Auth method">
                <span className="text-text-primary text-body-medium-regular">{getDisplayName(provider.auth_mode)}</span>
            </InfoRow>
            <InfoRow label="Display name">
                <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                    <span>{integration.display_name || provider.display_name}</span>
                    <CopyButton text={integration.display_name || provider.display_name} />
                </span>
            </InfoRow>
            <InfoRow label="Integration ID">
                <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                    <span>{integration.unique_key}</span>
                    <CopyButton text={integration.unique_key} />
                </span>
            </InfoRow>
            <InfoRow label="API documentation">
                <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                    <Link to={provider.docs} target="_blank" className="group w-fit inline-flex items-center gap-1">
                        {provider.display_name} <ExternalLink className="size-3.5 text-link-disabled group-hover:text-link-default" />
                    </Link>
                </span>
            </InfoRow>
            {apiStatus?.status && apiStatus?.status !== 'unknown' && (
                <InfoRow label="API status">
                    <div className="flex">
                        <StatusWidget className="text-text-primary" status={apiStatus?.status} />
                    </div>
                </InfoRow>
            )}
            <InfoRow label="Created">
                <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                    {new Date(integration.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
            </InfoRow>
        </div>
    );
};

interface InfoRowProps {
    label: string;
    children: React.ReactNode;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, children }) => {
    return (
        <div className="flex flex-col gap-1 px-5 py-4.5 border-b border-border-muted">
            <span className="text-text-tertiary text-body-medium-regular">{label}</span>
            {children}
        </div>
    );
};
