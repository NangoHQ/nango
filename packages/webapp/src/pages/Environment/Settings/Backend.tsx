import { IconKey, IconServer, IconTrash } from '@tabler/icons-react';
import { useStore } from '../../../store';
import { apiPatchEnvironment, useEnvironment } from '../../../hooks/useEnvironment';
import SecretInput from '../../../components/ui/input/SecretInput';
import { EditableInput } from './EditableInput';
import { Button } from '../../../components/ui/button/Button';
import { apiFetch } from '../../../utils/api';
import { useState } from 'react';
import { useToast } from '../../../hooks/useToast';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '../../../components/ui/Dialog';

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
        toast({ title: `New secret generated, delete one or the other to activate`, variant: 'success' });
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
        toast({ title: `New secret deleted, current secret is still active`, variant: 'success' });
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
        toast({ title: `Old secret deleted, new secret is now active`, variant: 'success' });
    };

    if (!environmentAndAccount) {
        return null;
    }

    const hasNewSecretKey = environmentAndAccount.environment.pending_secret_key;
    return (
        <div className="text-grayscale-100 flex flex-col gap-10">
            <div className="flex gap-2 items-center rounded-md bg-grayscale-900 px-8 h-10">
                <div>
                    <IconServer stroke={1} size={18} />
                </div>
                <h3 className="uppercase text-sm">Backend Settings</h3>
            </div>
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <fieldset className="flex flex-col gap-2">
                    <label htmlFor="secretKey" className="font-semibold mb-2">
                        Secret Key
                    </label>
                    {hasNewSecretKey && (
                        <label htmlFor="secretKey" className={'text-s'}>
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

                        {hasNewSecretKey && (
                            <Dialog>
                                <DialogTrigger asChild>
                                    <Button variant={'icon'} size="lg">
                                        <IconTrash stroke={1} />
                                    </Button>
                                </DialogTrigger>

                                <DialogContent>
                                    <DialogTitle>Rotate secret key?</DialogTitle>
                                    <DialogDescription>
                                        This key will be deleted and the new key will be activated. Only do this when the new key is in production. This
                                        operation is not reversible.
                                    </DialogDescription>
                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button variant={'tertiary'}>Cancel</Button>
                                        </DialogClose>
                                        <Button variant={'danger'} onClick={onRotate} isLoading={loading}>
                                            Rotate
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                    {!hasNewSecretKey && (
                        <div className="">
                            <Button variant={'secondary'} onClick={onGenerate} isLoading={loading}>
                                <IconKey stroke={1} />
                                Generate new secret key
                            </Button>
                        </div>
                    )}
                    {hasNewSecretKey && (
                        <div className="flex flex-col gap-1">
                            <label htmlFor="secretKey" className={'text-s'}>
                                New secret
                            </label>
                            <div className="flex gap-2">
                                <SecretInput
                                    view={false}
                                    inputSize={'lg'}
                                    copy={true}
                                    variant={'black'}
                                    name="pendingSecretKey"
                                    value={environmentAndAccount.environment.pending_secret_key!}
                                />
                                <Button variant={'icon'} size="lg" onClick={onRevert}>
                                    <IconTrash stroke={1} />
                                </Button>
                            </div>
                        </div>
                    )}
                </fieldset>

                <EditableInput
                    name="callback_url"
                    title="Callback URL"
                    placeholder="https://api.nango.dev/oauth/callback"
                    originalValue={environmentAndAccount.environment.callback_url}
                    apiCall={(value) => apiPatchEnvironment(env, { callback_url: value })}
                    onSuccess={() => void mutate()}
                />
            </div>
        </div>
    );
};
