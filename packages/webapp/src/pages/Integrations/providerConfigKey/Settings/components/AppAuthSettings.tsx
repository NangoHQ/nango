import { AppPrivateKeyInput } from './AppPrivateKeyInput';
import { CopyButton } from '@/components-v2/CopyButton';
import { EditableInput } from '@/components-v2/EditableInput';
import { InfoTooltip } from '@/components-v2/InfoTooltip';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components-v2/ui/input-group';
import { Label } from '@/components-v2/ui/label';
import { usePatchIntegration } from '@/hooks/useIntegration';
import { useToast } from '@/hooks/useToast';
import { validateNotEmpty, validateUrl } from '@/pages/Integrations/utils';
import { useStore } from '@/store';
import { defaultCallback } from '@/utils/cloud';

import type { ApiEnvironment, GetIntegration, PatchIntegration } from '@nangohq/types';

export const AppAuthSettings: React.FC<{ data: GetIntegration['Success']['data']; environment: ApiEnvironment }> = ({
    data: { integration, template },
    environment
}) => {
    const env = useStore((state) => state.env);
    const { toast } = useToast();
    const { mutateAsync: patchIntegration } = usePatchIntegration(env, integration.unique_key);

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
                <EditableInput initialValue={integration.oauth_client_id || ''} onSave={(value) => onSave({ appId: value })} validate={validateNotEmpty} />
            </div>

            {/* App Public Link */}
            <div className="flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                    <Label htmlFor="app_link">App Public Link</Label>
                    <InfoTooltip>Obtain the app public link from the app page.</InfoTooltip>
                </div>
                <EditableInput initialValue={integration.app_link || ''} onSave={(value) => onSave({ appLink: value })} validate={validateUrl} />
            </div>

            {/* App Private Key */}
            <AppPrivateKeyInput initialValue={integration.oauth_client_secret || ''} onSave={(value) => onSave({ privateKey: value })} />
        </div>
    );
};
