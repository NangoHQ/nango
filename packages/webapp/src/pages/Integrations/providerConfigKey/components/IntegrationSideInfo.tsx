import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { CopyButton } from '@/components-v2/CopyButton';
import { SideInfo, SideInfoRow } from '@/components-v2/SideInfo';
import { getDisplayName } from '@/pages/Integrations/utils';

import type { ApiIntegration, Provider } from '@nangohq/types';

export const IntegrationSideInfo: React.FC<{ integration: ApiIntegration; provider: Provider }> = ({ integration, provider }) => {
    return (
        <SideInfo>
            <SideInfoRow label="Auth method">
                <span className="text-text-primary text-body-medium-regular">{getDisplayName(provider.auth_mode)}</span>
            </SideInfoRow>
            <SideInfoRow label="Display name">
                <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                    <span>{integration.display_name || provider.display_name}</span>
                    <CopyButton text={integration.display_name || provider.display_name} />
                </span>
            </SideInfoRow>
            <SideInfoRow label="Integration ID">
                <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                    <span>{integration.unique_key}</span>
                    <CopyButton text={integration.unique_key} />
                </span>
            </SideInfoRow>
            <SideInfoRow label="API documentation">
                <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                    <Link to={provider.docs} target="_blank" className="group w-fit inline-flex items-center gap-1">
                        {provider.display_name} <ExternalLink className="size-3.5 text-link-disabled group-hover:text-link-default" />
                    </Link>
                </span>
            </SideInfoRow>
            <SideInfoRow label="Created">
                <span className="text-text-primary text-body-medium-regular inline-flex flex-wrap items-baseline gap-1">
                    {new Date(integration.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
            </SideInfoRow>
        </SideInfo>
    );
};
