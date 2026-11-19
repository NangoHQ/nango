import { Zap } from 'lucide-react';

import { Button } from '@nangohq/design-system';

import { PermissionGate } from '@/components/patterns/PermissionGate';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { usePostIntegration } from '@/hooks/useIntegration';
import { usePermissions } from '@/hooks/usePermissions';
import { useProvider } from '@/hooks/useProvider';
import { useToast } from '@/hooks/useToast';
import { getOneClickSetupBody } from '@/pages/Catalog/catalog.utils';
import { useStore } from '@/store';
import { returnToPlaygroundState } from '../returnToPlayground';
import { PlaygroundIcons } from './PlaygroundEvent';

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
            return `${name} needs your own developer app. The agent needs it to continue.`;
        case 'needs_setup':
            return `${name} needs a few settings first. The agent needs it to continue.`;
        default:
            return 'The agent needs it to continue.';
    }
}

export const AddIntegrationCard: React.FC<AddIntegrationCardProps> = ({ provider, name, outcome, href }) => {
    return (
        <div className="flex items-center gap-3 rounded-ds-xs border border-border-muted bg-surface-panel px-4 py-3">
            <PlaygroundIcons provider={provider} />
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-medium-medium text-text-strong">Add the {name} integration</span>
                <span className="text-body-small-regular text-text-secondary">{reason(outcome, name)}</span>
            </div>
            {outcome === 'needs_confirmation' ? (
                <OneClickAddButton provider={provider} name={name} href={href} />
            ) : (
                <ButtonLink to={href} state={returnToPlaygroundState()} size="sm">
                    Add integration
                </ButtonLink>
            )}
        </div>
    );
};

const OneClickAddButton: React.FC<{ provider: string; name: string; href: string }> = ({ provider, name, href }) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { can } = usePermissions();
    const { data: providerData, isError } = useProvider(env, provider);
    const { mutateAsync: postIntegration, isPending } = usePostIntegration(env);
    const body = providerData ? getOneClickSetupBody(providerData.data) : null;

    if (isError || (providerData && !body)) {
        return (
            <ButtonLink to={href} state={returnToPlaygroundState()} size="sm">
                Add integration
            </ButtonLink>
        );
    }

    const add = async () => {
        if (!body) {
            return;
        }
        try {
            await postIntegration(body);
        } catch {
            toast({ title: `Failed to add ${name}`, variant: 'error' });
        }
    };

    return (
        <PermissionGate asChild condition={can('environment:integrations:update')}>
            {(allowed) => (
                <Button size="sm" disabled={!allowed} loading={isPending || !providerData} onClick={() => void add()}>
                    <Zap className="fill-current stroke-none" />
                    Add integration
                </Button>
            )}
        </PermissionGate>
    );
};
