import { IconExternalLink, IconKey } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

import { EditableInput } from './components/EditableInput';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { useActivateKey, useEnvironment, usePatchEnvironment, useRevertKey, useRotateKey } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { APIError } from '../../../utils/api';
import { SecretInput } from '@/components-v2/SecretInput';
import { StyledLink } from '@/components-v2/StyledLink';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

export const BackendSettings: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { data } = useEnvironment(env);
    const environmentAndAccount = data?.environmentAndAccount;
    const { mutateAsync: patchEnvironmentAsync } = usePatchEnvironment(env);
    const { mutateAsync: rotateKeyAsync, isPending: isRotating } = useRotateKey(env);
    const { mutateAsync: revertKeyAsync, isPending: isReverting } = useRevertKey(env);
    const { mutateAsync: activateKeyAsync, isPending: isActivating } = useActivateKey(env);

    const { confirm, DialogComponent } = useConfirmDialog();

    const onGenerate = async () => {
        try {
            await rotateKeyAsync();
        } catch {
            toast({ title: `There was an issue when generating a new secret`, variant: 'error' });
        }
    };

    const onRevert = async () => {
        try {
            await revertKeyAsync();
        } catch {
            toast({ title: `There was an issue when reverting the secret`, variant: 'error' });
        }
    };

    const onRotate = async () => {
        try {
            await activateKeyAsync();
        } catch {
            toast({ title: `There was an issue when rotating the secret`, variant: 'error' });
        }
    };

    if (!environmentAndAccount) {
        return null;
    }

    const hasNewSecretKey = environmentAndAccount.environment.pending_secret_key;
    return (
        <SettingsContent title="Backend">
            <SettingsGroup label="Secret key">
                <fieldset className="flex flex-col gap-3.5">
                    <div className="flex flex-col gap-2">
                        {hasNewSecretKey && (
                            <label htmlFor="secretKey" className="text-sm">
                                Current secret
                            </label>
                        )}
                        <div className="flex gap-2">
                            <SecretInput copy name="secretKey" value={environmentAndAccount.environment.secret_key} />
                        </div>
                    </div>
                    {!hasNewSecretKey && (
                        <div className="flex justify-start">
                            <Button variant={'secondary'} onClick={onGenerate} loading={isRotating}>
                                <>
                                    <IconKey stroke={1} size={18} />
                                    Generate new secret key
                                </>
                            </Button>
                        </div>
                    )}
                    {hasNewSecretKey && (
                        <div className="flex flex-col gap-2">
                            <label htmlFor="secretKey" className="text-sm">
                                New secret
                            </label>
                            <SecretInput copy name="pendingSecretKey" value={environmentAndAccount.environment.pending_secret_key!} />
                        </div>
                    )}
                    {hasNewSecretKey && (
                        <Alert variant="info">
                            <AlertDescription>
                                The current secret is still active, the new secret is not. Confirm key rotation to activate new secret and deactivate current
                                secret.
                            </AlertDescription>
                        </Alert>
                    )}

                    {hasNewSecretKey && (
                        <div className="flex gap-3 justify-start">
                            <Button
                                onClick={() =>
                                    confirm({
                                        title: 'Cancel key rotation?',
                                        description:
                                            'The new key will be deactivated. Only do this when the old key is used in production. This is not reversible.',
                                        cancelButtonText: 'Dismiss',
                                        confirmButtonText: 'Cancel key rotation',
                                        confirmVariant: 'destructive',
                                        onConfirm: onRevert
                                    })
                                }
                                variant={'tertiary'}
                                loading={isReverting}
                            >
                                Cancel key rotation
                            </Button>

                            <Button
                                onClick={() =>
                                    confirm({
                                        title: 'Confirm key rotation?',
                                        description:
                                            'The old key will be deactivated. Only do this when the new key is used in production. This is not reversible.',
                                        cancelButtonText: 'Dismiss',
                                        confirmButtonText: 'Confirm key rotation',
                                        confirmVariant: 'destructive',
                                        onConfirm: onRotate
                                    })
                                }
                                variant={'primary'}
                                loading={isActivating}
                            >
                                Confirm key rotation
                            </Button>
                        </div>
                    )}
                </fieldset>
            </SettingsGroup>
            <SettingsGroup
                label={
                    <>
                        <div className="flex gap-1.5">
                            Callback URL
                            <Link
                                className="flex gap-2 items-center"
                                target="_blank"
                                to="https://nango.dev/docs/implementation-guides/platform/auth/configure-integration#2-create-an-integration"
                            >
                                <IconExternalLink stroke={1} size={18} />
                            </Link>
                        </div>
                    </>
                }
            >
                <EditableInput
                    name="callback_url"
                    placeholder="https://api.nango.dev/oauth/callback"
                    originalValue={environmentAndAccount.environment.callback_url}
                    editInfo={
                        <Alert variant="info">
                            <AlertDescription>
                                <span>
                                    Changing the callback URL requires an active 308 redirect and updating the registered callback URL with all OAuth API
                                    providers. Otherwise authorization attempts will fail. Details in{' '}
                                    <StyledLink
                                        to="https://nango.dev/docs/implementation-guides/platform/auth/implement-api-auth#5-setup-a-custom-oauth-callback-url-optional"
                                        type="external"
                                        variant="info"
                                    >
                                        docs
                                    </StyledLink>
                                    .
                                </span>
                            </AlertDescription>
                        </Alert>
                    }
                    apiCall={async (value) => {
                        try {
                            const res = await patchEnvironmentAsync({ callback_url: value });
                            return { json: res };
                        } catch (err) {
                            if (err instanceof APIError) return { json: err.json };
                            throw err;
                        }
                    }}
                    onSuccess={() => {}}
                />
            </SettingsGroup>
            {DialogComponent}
        </SettingsContent>
    );
};
