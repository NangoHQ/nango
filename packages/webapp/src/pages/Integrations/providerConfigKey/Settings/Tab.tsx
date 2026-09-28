import { ExternalLink, Info } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { AuthSpecificSettings } from './components/AuthSpecificSettings';
import { DeleteIntegrationButton } from './components/DeleteIntegrationButton';
import { GeneralSettings } from './components/GeneralSettings';
import { isOAuthCredentials, SettingsField, SettingsSection } from './components/SettingsLayout';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

export const SettingsTab: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({ data, environment }) => {
    const [guideDismissed, setGuideDismissed] = useState(false);
    const displayName = data.integration.display_name || data.template.display_name;
    const docs = data.template.docs;
    const showGuide = Boolean(docs) && !guideDismissed;
    const guideDescription = isOAuthCredentials(data.template.auth_mode)
        ? `Add your ${displayName} OAuth App credentials to enable user authentication.`
        : `Add your ${displayName} credentials to enable user authentication.`;

    return (
        <div className="flex w-full flex-col gap-4">
            {showGuide && (
                <Alert variant="info" onDismiss={() => setGuideDismissed(true)}>
                    <Info />
                    <AlertTitle>{displayName} setup guide</AlertTitle>
                    <AlertDescription>{guideDescription}</AlertDescription>
                    <AlertActions>
                        <AlertButtonLink to={docs} target="_blank">
                            Setup guide <ExternalLink />
                        </AlertButtonLink>
                    </AlertActions>
                </Alert>
            )}
            <div className="flex flex-col gap-10">
                <GeneralSettings data={data} environment={environment} />
                <AuthSpecificSettings data={data} environment={environment} />
                <SettingsSection title="Danger zone">
                    <SettingsField label="Delete integration" align="center">
                        <DeleteIntegrationButton env={environment.name} integration={data.integration} />
                    </SettingsField>
                </SettingsSection>
            </div>
        </div>
    );
};
