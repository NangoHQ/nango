import { ExternalLink, Info } from 'lucide-react';
import { useLocalStorage } from 'react-use';

import { Alert, AlertActions, AlertDescription, AlertTitle } from '@nangohq/design-system';

import { AlertButtonLink } from '@/components/ui/AlertButtonLink';
import { LocalStorageKeys } from '@/utils/local-storage';
import { AuthSpecificSettings } from './components/AuthSpecificSettings';
import { DeleteIntegrationButton } from './components/DeleteIntegrationButton';
import { GeneralSettings } from './components/GeneralSettings';
import { isOAuthCredentials, SettingsField, SettingsSection, showsCredentialsSection } from './components/SettingsLayout';

import type { ApiEnvironment, GetIntegration } from '@nangohq/types';

function setupGuideDescription(displayName: string, authMode: string): string {
    if (authMode === 'OAUTH2_CC') {
        return `Set the scopes ${displayName} should request.`;
    }
    if (isOAuthCredentials(authMode)) {
        return `Add your ${displayName} OAuth App credentials to enable user authentication.`;
    }
    return `Add your ${displayName} credentials to enable user authentication.`;
}

export const SettingsTab: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({ data, environment }) => {
    const displayName = data.integration.display_name || data.template.display_name;
    const docs = data.template.docs;
    const guideKey = `${environment.name}:${data.integration.unique_key}`;
    const [dismissedGuides, setDismissedGuides] = useLocalStorage<Record<string, true>>(LocalStorageKeys.IntegrationSetupGuideDismissed, {});
    const guideDismissed = dismissedGuides?.[guideKey] === true;
    const showGuide = Boolean(docs) && showsCredentialsSection(data) && !guideDismissed;
    const guideDescription = setupGuideDescription(displayName, data.template.auth_mode);

    return (
        <div className="flex w-full flex-col gap-4">
            {showGuide && (
                <Alert variant="info" onDismiss={() => setDismissedGuides({ ...dismissedGuides, [guideKey]: true })}>
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
                        <div>
                            <DeleteIntegrationButton env={environment.name} integration={data.integration} />
                        </div>
                    </SettingsField>
                </SettingsSection>
            </div>
        </div>
    );
};
