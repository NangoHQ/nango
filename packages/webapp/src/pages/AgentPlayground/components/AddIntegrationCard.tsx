import { IntegrationLogo } from '@/components/patterns/IntegrationLogo';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { returnToPlaygroundState } from '../returnToPlayground';

import type { AgentPlaygroundIntegrationSetup } from '@nangohq/types';

interface AddIntegrationCardProps {
    provider: string;
    name: string;
    outcome: AgentPlaygroundIntegrationSetup['outcome'];
    href: string;
}

function reason(outcome: AgentPlaygroundIntegrationSetup['outcome'], name: string): string {
    switch (outcome) {
        case 'needs_developer_app':
            return `${name} needs your own developer app.`;
        case 'needs_setup':
            return `${name} needs a few settings first.`;
        default:
            return 'The agent needs it to continue.';
    }
}

export const AddIntegrationCard: React.FC<AddIntegrationCardProps> = ({ provider, name, outcome, href }) => {
    return (
        <div className="flex items-center gap-3 rounded-ds-xs border border-border-muted bg-surface-panel px-4 py-3">
            <IntegrationLogo provider={provider} className="size-6 shrink-0 border-0 bg-transparent p-0" />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-medium-medium text-text-strong">Add the {name} integration</span>
                <span className="text-body-small-regular text-text-secondary">{reason(outcome, name)}</span>
            </div>
            <ButtonLink to={href} state={returnToPlaygroundState()} size="sm">
                Add integration
            </ButtonLink>
        </div>
    );
};
