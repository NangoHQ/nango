import { IconExternalLink, IconKey } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { EditableInput } from './components/EditableInput';
import SettingsContent from './components/SettingsContent';
import SettingsGroup from './components/SettingsGroup';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../../components/ui/Dialog';
import SecretInput from '../../../components/ui/input/SecretInput';
import { apiPatchEnvironment, useEnvironment } from '../../../hooks/useEnvironment';
import { useToast } from '../../../hooks/useToast';
import { useStore } from '../../../store';
import { apiFetch } from '../../../utils/api';
import { StyledLink } from '@/components-v2/StyledLink';
import { Alert, AlertDescription } from '@/components-v2/ui/alert';
import { Button } from '@/components-v2/ui/button';

export const BackendSettings: React.FC = () => {
    const { toast } = useToast();

    const env = useStore((state) => state.env);
    const { environmentAndAccount, mutate } = useEnvironment(env);

    const [loading, setLoading] = useState(false);

    const onGenerate = async () => {
        setLoading(true);
        const res = await apiFetch(`/api/v1/environment/rotate-key?env=${env}`, {
            method: 'POST',
            body: JSON.stringify({ type: 'secret' })
        });
        setLoading(false);

        if (res.status !== 200) {
            toast({ title: `There was an issue when generating a new secret`, variant: 'error' });
            return;
        }

        void mutate();
    };

    const onRevert = async () => {
        setLoading(true);
        const res = await apiFetch(`/api/v1/environment/revert-key?env=${env}`, {
            method: 'POST',
            body: JSON.stringify({ type: 'secret' })
        });
        setLoading(false);

        if (res.status !== 200) {
            toast({ title: `There was an issue when reverting the secret`, variant: 'error' });
            return;
        }

        void mutate();
    };

    const onRotate = async () => {
        setLoading(true);
        const res = await apiFetch(`/api/v1/environment/activate-key?env=${env}`, {
            method: 'POST',
            body: JSON.stringify({ type: 'secret' })
        });
        setLoading(false);

        if (res.status !== 200) {
            toast({ title: `There was an issue when rotating the secret`, variant: 'error' });
            return;
        }

        void mutate();
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
                            <SecretInput
                                view={false}
                                inputSize={'lg'}
                                copy={true}
                                variant={'black'}
                                name="secretKey"
                                value={environmentAndAccount.environment.secret_key}
                            />
                        </div>
                    </div>
                    {!hasNewSecretKey && (
                        <div className="flex justify-start">
                            <Button variant={'secondary'} onClick={onGenerate} loading={loading}>
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
                            <SecretInput
                                view={false}
                                inputSize={'lg'}
                                copy={true}
                                variant={'black'}
                                name="pendingSecretKey"
                                value={environmentAndAccount.environment.pending_secret_key!}
                            />
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
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant={'tertiary'}>Cancel key rotation</Button>
                                </DialogTrigger>

                                <DialogContent>
                                    <DialogTitle>Cancel key rotation?</DialogTitle>
                                    <DialogDescription>
                                        The new key will be deactivated. Only do this when the old key is used in production. This is not reversible.
                                    </DialogDescription>
                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button variant="tertiary">Dismiss</Button>
                                        </DialogClose>
                                        <Button variant="destructive" onClick={onRevert} loading={loading}>
                                            Cancel
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant={'primary'}>Confirm key rotation</Button>
                                </DialogTrigger>

                                <DialogContent>
                                    <DialogTitle>Confirm key rotation?</DialogTitle>
                                    <DialogDescription>
                                        The old key will be deactivated. Only do this when the new key is used in production. This is not reversible.
                                    </DialogDescription>
                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button variant={'tertiary'}>Dismiss</Button>
                                        </DialogClose>
                                        <Button variant="destructive" onClick={onRotate} loading={loading}>
                                            Confirm key rotation
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
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
                                to="https://nango.dev/docs/implementation-guides/api-auth/configure-integration#2-create-an-integration"
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
                                        to="https://nango.dev/docs/implementation-guides/api-auth/implement-api-auth#5-setup-a-custom-oauth-callback-url-optional"
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
                    apiCall={(value) => apiPatchEnvironment(env, { callback_url: value })}
                    onSuccess={() => void mutate()}
                />
            </SettingsGroup>
        </SettingsContent>
    );
};
