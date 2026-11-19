import { CircleAlert, RotateCcw, Settings2 } from 'lucide-react';

import { Alert, AlertActions, AlertButton, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { isAdded } from '../setUpTool';
import { providerName } from '../starterPrompts';
import { AddIntegrationCard } from './AddIntegrationCard';
import { PlaygroundEvent, PlaygroundEventExplanation } from './PlaygroundEvent';

import type { IntegrationLabels } from '../toolDisplay';
import type { AgentPlaygroundIntegrationSetup } from '@nangohq/types';

export const IntegrationSetupNotice: React.FC<{
    env: string;
    setup: AgentPlaygroundIntegrationSetup;
    labels: IntegrationLabels | undefined;
    addedIntegrations: ReadonlyMap<string, string>;
    onTryAgain?: (() => void) | undefined;
}> = ({ env, setup, labels, addedIntegrations, onTryAgain }) => {
    const addedSince = isAdded(setup) ? undefined : addedIntegrations.get(setup.provider);
    const integrationId = addedSince ?? setup.integrationId;
    const name = (integrationId && labels?.get(integrationId)?.integrationName) || setup.displayName || providerName(setup.provider);
    const href = integrationId ? `/${env}/integrations/${integrationId}` : `/${env}/integrations/create/${setup.provider}`;

    if (addedSince) {
        return <AddedIntegrationRow provider={setup.provider} text={`is using your ${name} integration`} href={href} />;
    }

    if (setup.outcome === 'missing_credentials') {
        return (
            <Alert variant="warning">
                <CircleAlert />
                <AlertTitle>{`Finish setting up your ${name} integration`}</AlertTitle>
                <AlertDescription>It&apos;s missing its client ID or secret. Add them, then try again.</AlertDescription>
                <AlertActions>
                    <AlertButtonLink to={href}>
                        <Settings2 /> Open integration
                    </AlertButtonLink>
                    {onTryAgain && (
                        <AlertButton onClick={onTryAgain}>
                            <RotateCcw /> Try again
                        </AlertButton>
                    )}
                </AlertActions>
            </Alert>
        );
    }

    if (!isAdded(setup)) {
        return <AddIntegrationCard provider={setup.provider} name={name} outcome={setup.outcome} href={href} />;
    }

    if (setup.outcome === 'created') {
        return (
            <AddedIntegrationRow
                provider={setup.provider}
                text={`added the ${name} integration`}
                href={href}
                explanation={`Agent sessions can only use integrations that exist in your environment.${setup.usesSharedCredentials ? ` It uses Nango's developer app.` : ''}`}
            />
        );
    }
    return <AddedIntegrationRow provider={setup.provider} text={`is using your ${name} integration`} href={href} />;
};

const AddedIntegrationRow: React.FC<{ provider: string; text: string; href: string; explanation?: string | undefined }> = ({
    provider,
    text,
    href,
    explanation
}) => (
    <PlaygroundEvent
        provider={provider}
        text={text}
        link={{ label: 'View integration', to: href }}
        details={explanation && <PlaygroundEventExplanation>{explanation}</PlaygroundEventExplanation>}
    />
);
