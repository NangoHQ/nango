import { InputGroup, InputGroupAddon, InputGroupInput } from '@nangohq/design-system';

import { EditableInput } from '@/components/patterns/EditableInput';
import { CopyButton } from '@/components/ui/CopyButton';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { NangoProvidedInput } from '@/pages/Integrations/components/NangoProvidedInput';
import { validateNotEmpty, validateUrl } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/cloud';
import { AppPrivateKeyInput } from './AppPrivateKeyInput';
import { SettingsField } from './SettingsLayout';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const AppAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);

    const isSharedCredentials = Boolean(integration.shared_credentials_id);
    const setupUrl = (environment.callback_url || defaultCallback()).replace('oauth/callback', 'app-auth/connect');

    const onSave = async (field: Partial<PatchIntegration['Body']>) => {
        try {
            await patchIntegration({
                authType: template.auth_mode as Extract<typeof template.auth_mode, 'APP'>,
                ...field
            });
            toast({ title: 'Successfully updated', variant: 'success' });
        } catch {
            const message = 'Failed to update, an error occurred';
            toast({ title: message, variant: 'error' });
            throw new Error(message);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <SettingsField
                label="Setup URL"
                htmlFor="setup_url"
                info={
                    <InfoTooltip size="sm">
                        Register this setup URL on the app settings page in the &quot;Post Installation section&quot;. Check &quot;Redirect on update&quot; as
                        well.
                    </InfoTooltip>
                }
            >
                <InputGroup>
                    <InputGroupInput disabled value={setupUrl} />
                    <InputGroupAddon align="inline-end">
                        <CopyButton text={setupUrl} />
                    </InputGroupAddon>
                </InputGroup>
            </SettingsField>

            <SettingsField label="App ID" htmlFor="app_id" info={<InfoTooltip size="sm">Obtain the app id from the app page.</InfoTooltip>}>
                {isSharedCredentials ? (
                    <NangoProvidedInput fakeValueSize={12} />
                ) : (
                    <EditableInput initialValue={integration.oauth_client_id || ''} onSave={(value) => onSave({ appId: value })} validate={validateNotEmpty} />
                )}
            </SettingsField>

            <SettingsField label="App public link" htmlFor="app_link" info={<InfoTooltip size="sm">Obtain the app public link from the app page.</InfoTooltip>}>
                {isSharedCredentials ? (
                    <NangoProvidedInput fakeValueSize={24} />
                ) : (
                    <EditableInput initialValue={integration.app_link || ''} onSave={(value) => onSave({ appLink: value })} validate={validateUrl} />
                )}
            </SettingsField>

            {isSharedCredentials ? (
                <SettingsField label="App private key" htmlFor="private_key">
                    <NangoProvidedInput fakeValueSize={48} />
                </SettingsField>
            ) : (
                <AppPrivateKeyInput initialValue={integration.oauth_client_secret || ''} onSave={(value) => onSave({ privateKey: value })} />
            )}
        </div>
    );
};
