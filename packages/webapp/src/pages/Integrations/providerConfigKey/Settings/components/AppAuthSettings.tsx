import { InfoTooltip } from './InfoTooltip';
import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { apiPatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/utils';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const AppAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();

    const setupUrl = (environment.callback_url || defaultCallback()).replace('oauth/callback', 'app-auth/connect');

    const onSave = async (field: Partial<PatchIntegration['Body']>) => {
        const updated = await apiPatchIntegration(env, integration.unique_key, {
            authType: template.auth_mode as Extract<typeof template.auth_mode, 'APP'>,
            ...field
        });
        if ('error' in updated.json) {
            const errorMessage = updated.json.error.message || 'Failed to update, an error occurred';
            toast({ title: errorMessage, variant: 'error' });
            throw new Error(errorMessage);
        } else {
            toast({ title: 'Successfully updated', variant: 'success' });
        }
    };

    return (
        <div className="flex flex-col gap-10">
            {/* Setup URL */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                    <Label htmlFor="setup_url">Setup URL</Label>
                    <InfoTooltip>
                        Register this setup URL on the app settings page in the &quot;Post Installation section&quot;. Check &quot;Redirect on update&quot; as
                        well.
                    </InfoTooltip>
                </div>
                <InputGroup>
                    <InputGroupInput disabled value={setupUrl} />
                    <InputGroupAddon align="inline-end">
                        <CopyButton text={setupUrl} />
                    </InputGroupAddon>
                </InputGroup>
            </div>

            {/* App ID */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                    <Label htmlFor="app_id">App ID</Label>
                    <InfoTooltip>Obtain the app id from the app page.</InfoTooltip>
                </div>
                <EditableInput initialValue={integration.oauth_client_id || ''} onSave={(value) => onSave({ appId: value })} />
            </div>

            {/* App Public Link */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                    <Label htmlFor="app_link">App Public Link</Label>
                    <InfoTooltip>Obtain the app public link from the app page.</InfoTooltip>
                </div>
                <EditableInput initialValue={integration.app_link || ''} onSave={(value) => onSave({ appLink: value })} />
            </div>

            {/* App Private Key */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                    <Label htmlFor="private_key">App Private Key</Label>
                    <InfoTooltip>
                        Obtain the app private key from the app page by downloading the private key and pasting the entirety of its contents here.
                    </InfoTooltip>
                </div>
                <EditableInput
                    secret
                    textArea
                    initialValue={integration.oauth_client_secret || ''}
                    hintText='Private key must start with "-----BEGIN RSA PRIVATE KEY----" and end with "-----END RSA PRIVATE KEY-----"'
                    validate={(value) => {
                        if (!value.trim()) {
                            return 'Private key is required';
                        }
                        if (!value.trim().startsWith('-----BEGIN RSA PRIVATE KEY----') || !value.trim().endsWith('-----END RSA PRIVATE KEY-----')) {
                            return 'Private key must start with "-----BEGIN RSA PRIVATE KEY----" and end with "-----END RSA PRIVATE KEY-----"';
                        }
                        return null;
                    }}
                    onSave={(value) => onSave({ privateKey: value })}
                />
            </div>
        </div>
    );
};
