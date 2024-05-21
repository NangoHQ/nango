import { toast } from 'react-toastify';
import { Prism } from '@mantine/prism';
import { useState, useEffect } from 'react';
import { AlertTriangle, HelpCircle } from '@geist-ui/icons';
import { TrashIcon } from '@heroicons/react/24/outline';
import { Tooltip, useModal, Modal } from '@geist-ui/core';

import {
    useEditCallbackUrlAPI,
    useEditWebhookUrlAPI,
    useEditWebhookSecondaryUrlAPI,
    useEditHmacEnabledAPI,
    useEditHmacKeyAPI,
    useEditEnvVariablesAPI,
    useEditAlwaysSendWebhookAPI,
    useEditSendAuthWebhookAPI
} from '../utils/api';
import IntegrationLogo from '../components/ui/IntegrationLogo';
import { isCloud, defaultCallback } from '../utils/utils';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import SecretInput from '../components/ui/input/SecretInput';
import { useStore } from '../store';
import Button from '../components/ui/button/Button';
import { useEnvironment } from '../hooks/useEnvironment';
import { connectSlack } from '../utils/slack-connection';

export const EnvironmentSettings: React.FC = () => {
    const env = useStore((state) => state.env);

    const [secretKey, setSecretKey] = useState('');
    const [secretKeyRotatable, setSecretKeyRotatable] = useState(true);
    const [hasPendingSecretKey, setHasPendingSecretKey] = useState(false);

    const [publicKey, setPublicKey] = useState('');
    const [publicKeyRotatable, setPublicKeyRotatable] = useState(true);
    const [hasPendingPublicKey, setHasPendingPublicKey] = useState(false);

    const [callbackUrl, setCallbackUrl] = useState('');
    const [hostUrl, setHostUrl] = useState('');

    const [webhookUrl, setWebhookUrl] = useState('');
    const [callbackEditMode, setCallbackEditMode] = useState(false);
    const [webhookEditMode, setWebhookEditMode] = useState(false);

    const [webhookUrlSecondary, setWebhookUrlSecondary] = useState('');
    const [webhookSecondaryEditMode, setWebhookSecondaryEditMode] = useState(false);

    const [slackIsConnected, setSlackIsConnected] = useState(false);
    const [slackConnectedChannel, setSlackConnectedChannel] = useState<string | null>('');

    const [hmacKey, setHmacKey] = useState<string | null>('');
    const [hmacEnabled, setHmacEnabled] = useState(false);
    const [accountUUID, setAccountUUID] = useState<string>('');
    const [alwaysSendWebhook, setAlwaysSendWebhook] = useState(false);
    const [sendAuthWebhook, setSendAuthWebhook] = useState(false);
    const [hmacEditMode, setHmacEditMode] = useState(false);
    const [envVariables, setEnvVariables] = useState<{ id?: number; name: string; value: string }[]>([]);
    const editCallbackUrlAPI = useEditCallbackUrlAPI(env);
    const editWebhookUrlAPI = useEditWebhookUrlAPI(env);
    const editWebhookSecondaryUrlAPI = useEditWebhookSecondaryUrlAPI(env);
    const editHmacEnabled = useEditHmacEnabledAPI(env);
    const editAlwaysSendWebhook = useEditAlwaysSendWebhookAPI(env);
    const editSendAuthWebhook = useEditSendAuthWebhookAPI(env);
    const editHmacKey = useEditHmacKeyAPI(env);
    const editEnvVariables = useEditEnvVariablesAPI(env);

    const { setVisible, bindings } = useModal();
    const { setVisible: setSecretVisible, bindings: secretBindings } = useModal();

    const { environmentAndAccount, mutate } = useEnvironment(env);

    useEffect(() => {
        setEnvVariables(envVariables.filter((env) => env.id));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [env]);

    useEffect(() => {
        if (!environmentAndAccount) {
            return;
        }

        const { environment, host, uuid, env_variables, slack_notifications_channel } = environmentAndAccount;
        setSecretKey(environment.pending_secret_key || environment.secret_key);
        setSecretKeyRotatable(environment.secret_key_rotatable !== false);
        setHasPendingSecretKey(Boolean(environment.pending_secret_key));

        setPublicKey(environment.pending_public_key || environment.public_key);
        setPublicKeyRotatable(environment.public_key_rotatable !== false);
        setHasPendingPublicKey(Boolean(environment.pending_public_key));

        setCallbackUrl(environment.callback_url || defaultCallback());

        setWebhookUrl(environment.webhook_url || '');
        setWebhookUrlSecondary(environment.webhook_url_secondary || '');
        setSendAuthWebhook(environment.send_auth_webhook);
        setHostUrl(host);
        setAccountUUID(uuid);

        setHmacEnabled(environment.hmac_enabled);
        setAlwaysSendWebhook(environment.always_send_webhook);
        setHmacKey(environment.hmac_key || '');

        setSlackIsConnected(environment.slack_notifications);
        setSlackConnectedChannel(slack_notifications_channel);

        setEnvVariables(env_variables);
    }, [environmentAndAccount]);

    const handleCallbackSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            callback_url: { value: string };
        };

        const res = await editCallbackUrlAPI(target.callback_url.value);

        if (res?.status === 200) {
            toast.success('Callback URL updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setCallbackEditMode(false);
            setCallbackUrl(target.callback_url.value || defaultCallback());
            void mutate();
        }
    };

    const handleWebhookEditSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            webhook_url: { value: string };
        };

        const res = await editWebhookUrlAPI(target.webhook_url.value);

        if (res?.status === 200) {
            toast.success('Wehook URL updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setWebhookEditMode(false);
            setWebhookUrl(target.webhook_url.value);
            void mutate();
        }
    };

    const handleWebhookSecondaryEditSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            webhook_url_secondary: { value: string };
        };

        const res = await editWebhookSecondaryUrlAPI(target.webhook_url_secondary.value);

        if (res?.status === 200) {
            toast.success('Secondary Wehook URL updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setWebhookSecondaryEditMode(false);
            setWebhookUrlSecondary(target.webhook_url_secondary.value);
            void mutate();
        }
    };

    const handleCallbackEdit = () => {
        setCallbackEditMode(true);
    };

    const handleHmacEnabled = async (checked: boolean) => {
        if (!hmacKey && checked) {
            toast.error('Cannot enable HMAC without an HMAC key.', { position: toast.POSITION.BOTTOM_CENTER });
        } else {
            setHmacEnabled(checked);
            editHmacEnabled(checked).then(() => {
                toast.success(checked ? 'HMAC enabled.' : 'HMAC disabled.', { position: toast.POSITION.BOTTOM_CENTER });
                void mutate();
            });
        }
    };

    const handleWebookSendUpdate = async (checked: boolean) => {
        setAlwaysSendWebhook(checked);
        editAlwaysSendWebhook(checked).then(() => {
            toast.success(checked ? 'Always send webhooks.' : 'Only send webhhoks on added, updated, or deleted.', { position: toast.POSITION.BOTTOM_CENTER });
        });
    };

    const handleWebookSendAuth = async (checked: boolean) => {
        setSendAuthWebhook(checked);
        editSendAuthWebhook(checked).then(() => {
            toast.success(checked ? 'Send new connection creation webhooks' : 'Do not send new connection creation webhooks', {
                position: toast.POSITION.BOTTOM_CENTER
            });
        });
    };

    const handleHmacSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            hmac_key: { value: string };
        };

        const res = await editHmacKey(target.hmac_key.value);

        if (res?.status === 200) {
            toast.success('HMAC key updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setHmacEditMode(false);
            setHmacKey(target.hmac_key.value);
            void mutate();
        }

        setHmacEditMode(false);
    };

    const handleEnvVariablesSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const formData = new FormData(e.target as HTMLFormElement);
        const entries = Array.from(formData.entries());

        const envVariablesArray = entries.reduce<{ name: string; value: string }[]>((acc, [key, value]) => {
            // we use the index to match on the name and value
            // but strip everything before the dash to remove the dynamic aspect
            // to the name. The dynamic aspect is needed to make sure the values
            // show correctly when reloading environments
            const strippedKey = key.split('-')[1];
            const match = strippedKey.match(/^env_var_(name|value)_(\d+)$/);
            if (match) {
                const type = match[1];
                const index = parseInt(match[2], 10);
                if (!acc[index]) {
                    acc[index] = {} as { name: string; value: string };
                }
                if (type === 'name') {
                    acc[index].name = value as string;
                } else if (type === 'value') {
                    acc[index].value = value as string;
                }
            }
            return acc;
        }, []);

        const res = await editEnvVariables(envVariablesArray);

        if (res?.status === 200) {
            toast.success('Environment variables updated!', { position: toast.POSITION.BOTTOM_CENTER });
            void mutate();
        }
    };

    const handleAddEnvVariable = () => {
        setEnvVariables([...envVariables, { name: '', value: '' }]);
    };

    const handleRemoveEnvVariable = async (index: number) => {
        setEnvVariables(envVariables.filter((_, i) => i !== index));

        const strippedEnvVariables = envVariables.filter((_, i) => i !== index).filter((envVariable) => envVariable.name && envVariable.value);
        const res = await editEnvVariables(strippedEnvVariables as unknown as Record<string, string>[]);

        if (res?.status === 200) {
            toast.success('Environment variables updated!', { position: toast.POSITION.BOTTOM_CENTER });
            void mutate();
        }
    };

    const handleActivatePublicKey = async () => {
        setVisible(true);
    };

    const handleActivateSecretKey = async () => {
        setSecretVisible(true);
    };

    const onRotateKey = async (publicKey = true) => {
        const res = await fetch(`/api/v1/environment/rotate-key?env=${env}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: publicKey ? 'public' : 'secret'
            })
        });

        if (res.status === 200) {
            const key = (await res.json())['key'];
            if (publicKey) {
                setPublicKey(key);
                setHasPendingPublicKey(true);
                toast.success('New public key generated', { position: toast.POSITION.BOTTOM_CENTER });
            } else {
                setSecretKey(key);
                setHasPendingSecretKey(true);
                toast.success('New secret key generated', { position: toast.POSITION.BOTTOM_CENTER });
            }
            void mutate();
        }
    };

    const onRevertKey = async (publicKey = true) => {
        const res = await fetch(`/api/v1/environment/revert-key?env=${env}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: publicKey ? 'public' : 'secret'
            })
        });

        if (res.status === 200) {
            const key = (await res.json())['key'];
            if (publicKey) {
                setPublicKey(key);
                setHasPendingPublicKey(false);
                toast.success('Public key reverted', { position: toast.POSITION.BOTTOM_CENTER });
            } else {
                setSecretKey(key);
                setHasPendingSecretKey(false);
                toast.success('Secret key reverted', { position: toast.POSITION.BOTTOM_CENTER });
            }
            void mutate();
        }
    };

    const onActivateKey = async (publicKey = true) => {
        const res = await fetch(`/api/v1/environment/activate-key?env=${env}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: publicKey ? 'public' : 'secret'
            })
        });

        if (res.status === 200) {
            if (publicKey) {
                toast.success('New public key activated', { position: toast.POSITION.BOTTOM_CENTER });
                setVisible(false);
                setHasPendingPublicKey(false);
            } else {
                toast.success('New secret key activated', { position: toast.POSITION.BOTTOM_CENTER });
                setSecretVisible(false);
                setHasPendingSecretKey(false);
            }
            void mutate();
        }
    };

    const updateSlackNotifications = async (enabled: boolean) => {
        await fetch(`/api/v1/environment/slack-notifications-enabled?env=${env}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                slack_notifications: enabled
            })
        });
    };

    const disconnectSlack = async () => {
        await updateSlackNotifications(false);

        const res = await fetch(`/api/v1/connection/admin/account-${accountUUID}-${env}?env=${env}`, {
            method: 'DELETE'
        });

        if (res.status !== 204) {
            toast.error('There was a problem when disconnecting Slack', { position: toast.POSITION.BOTTOM_CENTER });
        } else {
            toast.success('Slack was disconnected successfully.', { position: toast.POSITION.BOTTOM_CENTER });
            setSlackIsConnected(false);
            void mutate();
        }
    };

    const createSlackConnection = async () => {
        const onFinish = () => {
            setSlackIsConnected(true);
            toast.success('Slack connection created!', { position: toast.POSITION.BOTTOM_CENTER });
            void mutate();
        };

        const onFailure = () => {
            toast.error('Something went wrong during the lookup for the Slack connect', { position: toast.POSITION.BOTTOM_CENTER });
        };
        await connectSlack({ accountUUID, env, hostUrl, onFinish, onFailure });
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.EnvironmentSettings}>
            <Modal {...bindings} wrapClassName="!w-max overflow-visible">
                <div className="flex justify-between">
                    <div className="flex h-full">
                        <span className="flex bg-red-200 w-10 h-10 rounded-full items-center justify-center">
                            <AlertTriangle className="stroke-red-600" />
                        </span>
                    </div>
                    <div>
                        <Modal.Title className="text-lg">Activate new public key?</Modal.Title>
                        <Modal.Content>
                            <p>
                                Make sure your code uses the new public key before activating. All authorization attempts with the previous public key will fail
                                when the new key is activated.
                            </p>
                        </Modal.Content>
                    </div>
                </div>
                <Modal.Action placeholder={null} passive className="!text-lg" onClick={() => setVisible(false)}>
                    Cancel
                </Modal.Action>
                <Modal.Action placeholder={null} className="!bg-red-500 !text-white !text-lg" onClick={() => onActivateKey()}>
                    Activate
                </Modal.Action>
            </Modal>
            <Modal {...secretBindings} wrapClassName="!w-max overflow-visible">
                <div className="flex justify-between">
                    <div className="flex h-full">
                        <span className="flex bg-red-200 w-10 h-10 rounded-full items-center justify-center">
                            <AlertTriangle className="stroke-red-600" />
                        </span>
                    </div>
                    <div>
                        <Modal.Title className="text-lg">Activate new secret key?</Modal.Title>
                        <Modal.Content>
                            <p>
                                Make sure your code uses the new secret key before activating. All requests made with the previous secret key will fail as soon
                                as the new key is activated.
                            </p>
                        </Modal.Content>
                    </div>
                </div>
                <Modal.Action placeholder={null} passive className="!text-lg" onClick={() => setSecretVisible(false)}>
                    Cancel
                </Modal.Action>
                <Modal.Action placeholder={null} className="!bg-red-500 !text-white !text-lg" onClick={() => onActivateKey(false)}>
                    Activate
                </Modal.Action>
            </Modal>
            {secretKey && (
                <div className="h-full mb-20">
                    <h2 className="text-left text-3xl font-semibold tracking-tight text-white mb-12">Environment Settings</h2>
                    <div className="border border-border-gray rounded-md h-fit pt-6 pb-14">
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex">
                                    <label htmlFor="public_key" className="text-text-light-gray block text-sm font-semibold mb-2">
                                        Public Key
                                    </label>
                                    <Tooltip
                                        text={
                                            <>
                                                <div className="flex text-black text-sm">
                                                    {`Used by the`}
                                                    <a
                                                        href="https://docs.nango.dev/reference/sdks/frontend"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-text-blue ml-1"
                                                    >
                                                        Frontend SDK
                                                    </a>
                                                    {'.'}
                                                </div>
                                            </>
                                        }
                                    >
                                        <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                    </Tooltip>
                                </div>
                                <div className="flex">
                                    <Prism className="w-full" language="bash" colorScheme="dark">
                                        {publicKey}
                                    </Prism>
                                    {publicKeyRotatable && (
                                        <>
                                            <button
                                                onClick={() => (hasPendingPublicKey ? onRevertKey() : onRotateKey())}
                                                className="hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                            >
                                                {hasPendingPublicKey ? 'Revert' : 'Rotate'}
                                            </button>
                                            <button
                                                onClick={handleActivatePublicKey}
                                                className={`${hasPendingPublicKey ? 'hover:bg-hover-gray bg-gray-800' : 'opacity-50'} text-red-500 flex h-11 rounded-md ml-2 px-4 pt-3 text-sm`}
                                                disabled={!hasPendingPublicKey}
                                            >
                                                Activate
                                            </button>
                                        </>
                                    )}
                                </div>
                                {hasPendingPublicKey && (
                                    <div className=" text-red-500 text-sm">
                                        Click &apos;Activate&apos; to use this new key. Until then, Nango expects the old key. After activation the old key
                                        won&apos;t work.
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex">
                                    <label htmlFor="secret_key" className="text-text-light-gray block text-sm font-semibold mb-2">
                                        Secret Key
                                    </label>
                                    <Tooltip
                                        text={
                                            <>
                                                <div className="flex text-black text-sm">
                                                    {`Used by the `}
                                                    <a
                                                        href="https://docs.nango.dev/reference/cli"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-text-blue ml-1"
                                                    >
                                                        CLI
                                                    </a>
                                                    {`, `}
                                                    <a
                                                        href="https://docs.nango.dev/reference/sdks/node"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-text-blue ml-1 mr-1"
                                                    >
                                                        Backend SDKs
                                                    </a>
                                                    {` and `}
                                                    <a
                                                        href="https://docs.nango.dev/reference/api/authentication"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-text-blue ml-1"
                                                    >
                                                        REST API
                                                    </a>
                                                    {'.'}
                                                </div>
                                            </>
                                        }
                                    >
                                        <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                    </Tooltip>
                                </div>
                                <div className="flex">
                                    <SecretInput
                                        additionalclass="w-full h-11"
                                        tall
                                        disabled
                                        copy={true}
                                        optionalvalue={secretKey}
                                        setoptionalvalue={setSecretKey}
                                    />
                                    {secretKeyRotatable && (
                                        <>
                                            <button
                                                onClick={() => (hasPendingSecretKey ? onRevertKey(false) : onRotateKey(false))}
                                                className="hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                            >
                                                {hasPendingSecretKey ? 'Revert' : 'Rotate'}
                                            </button>
                                            <button
                                                onClick={handleActivateSecretKey}
                                                className={`${hasPendingSecretKey ? 'hover:bg-hover-gray bg-gray-800' : 'opacity-50'} text-red-500 flex h-11 rounded-md ml-2 px-4 pt-3 text-sm`}
                                                disabled={!hasPendingSecretKey}
                                            >
                                                Activate
                                            </button>
                                        </>
                                    )}
                                </div>
                                {hasPendingSecretKey && (
                                    <div className=" text-red-500 text-sm">
                                        Click &apos;Activate&apos; to use this new key. Until then, Nango expects the old key. After activation the old key
                                        won&apos;t work.
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-between mx-8 mt-8">
                            <div>
                                <label htmlFor="slack_alerts" className="flex text-text-light-gray items-center block text-sm font-semibold mb-2">
                                    Slack Alerts
                                    <Tooltip
                                        text={
                                            <div className="flex text-black text-sm">
                                                {slackIsConnected
                                                    ? 'Stop receiving Slack alerts to a public channel of your choice when a syncs or actions fail.'
                                                    : 'Receive Slack alerts to a public channel of your choice when a syncs or actions fail.'}
                                            </div>
                                        }
                                    >
                                        <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                    </Tooltip>
                                </label>
                            </div>
                            <div className="">
                                <Button className="items-center" variant="primary" onClick={slackIsConnected ? disconnectSlack : createSlackConnection}>
                                    <IntegrationLogo provider="slack" height={5} width={6} classNames="" />
                                    {slackIsConnected ? `Disconnect ${slackConnectedChannel}` : 'Connect'}
                                </Button>
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex text-white  mb-2">
                                    <div className="flex">
                                        <label htmlFor="callback_url" className="text-text-light-gray block text-sm font-semibold mb-2">
                                            Callback URL
                                        </label>
                                        <Tooltip
                                            text={
                                                <>
                                                    <div className="flex text-black text-sm">
                                                        {`To register with external OAuth apps (cf. `}
                                                        <a
                                                            href="https://docs.nango.dev/integrate/guides/authorize-an-api#use-a-custom-callback-url"
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-text-blue ml-1"
                                                        >
                                                            custom callback URL docs
                                                        </a>
                                                        {`).`}
                                                    </div>
                                                </>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                    </div>
                                </div>
                                {callbackEditMode && (
                                    <form className="mt-2" onSubmit={handleCallbackSave}>
                                        <div className="flex">
                                            <input
                                                id="callback_url"
                                                name="callback_url"
                                                autoComplete="new-password"
                                                type="url"
                                                defaultValue={callbackUrl}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                            />

                                            <button
                                                type="submit"
                                                className="border-border-blue bg-bg-dark-blue active:ring-border-blue flex h-11 rounded-md border ml-4 px-4 pt-3 text-sm font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                            >
                                                Save
                                            </button>
                                        </div>
                                        <p className="mt-2 text-sm text-red-700">
                                            {isCloud() ? (
                                                <>
                                                    Customizing the callback URL requires that you set up a 308 redirect from the custom callback URL to
                                                    https://api.nango.dev/oauth/callback.
                                                </>
                                            ) : (
                                                <>
                                                    Customizing the callback URL requires that you set up a redirect from the custom callback URL to{' '}
                                                    {defaultCallback()}.
                                                </>
                                            )}
                                        </p>
                                    </form>
                                )}
                                {!callbackEditMode && (
                                    <div className="flex">
                                        <Prism language="bash" colorScheme="dark" className="w-full">
                                            {callbackUrl}
                                        </Prism>
                                        <button
                                            onClick={handleCallbackEdit}
                                            className="hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex">
                                    <label htmlFor="webhook_url" className="text-text-light-gray block text-sm font-semibold mb-2">
                                        Webhook URL
                                    </label>
                                    <Tooltip
                                        text={
                                            <>
                                                <div className="flex text-black text-sm">
                                                    {`Be notified when new data is available from Nango (cf. `}
                                                    <a
                                                        href="https://docs.nango.dev/integrate/guides/sync-data-from-an-api#listen-for-webhooks-from-nango"
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-text-blue ml-1"
                                                    >
                                                        webhook docs
                                                    </a>
                                                    {`).`}
                                                </div>
                                            </>
                                        }
                                    >
                                        <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                    </Tooltip>
                                </div>
                                {webhookEditMode && (
                                    <form className="mt-2" onSubmit={handleWebhookEditSave}>
                                        <div className="flex">
                                            <input
                                                id="webhook_url"
                                                name="webhook_url"
                                                autoComplete="new-password"
                                                type="url"
                                                defaultValue={webhookUrl}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                            />

                                            <button
                                                type="submit"
                                                className="border-border-blue bg-bg-dark-blue active:ring-border-blue flex h-11 rounded-md border ml-4 px-4 pt-3 text-sm font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </form>
                                )}
                                {!webhookEditMode && (
                                    <div className="flex">
                                        <Prism language="bash" colorScheme="dark" className="w-full">
                                            {webhookUrl || '\u0000'}
                                        </Prism>
                                        <button
                                            onClick={() => setWebhookEditMode(!webhookEditMode)}
                                            className="hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            {!environmentAndAccount?.environment.webhook_url_secondary && !webhookSecondaryEditMode ? (
                                <button
                                    onClick={() => setWebhookSecondaryEditMode(true)}
                                    className="mx-8 mt-4 hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md px-4 pt-3 text-sm"
                                    type="button"
                                >
                                    Add Secondary Webhook URL
                                </button>
                            ) : (
                                <>
                                    <div className="mx-8 mt-8">
                                        <div className="flex">
                                            <label htmlFor="webhook_url" className="text-text-light-gray block text-sm font-semibold mb-2">
                                                Secondary Webhook URL
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            {`Be notified when new data is available from Nango (cf. `}
                                                            <a
                                                                href="https://docs.nango.dev/integrate/guides/sync-data-from-an-api#listen-for-webhooks-from-nango"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-text-blue ml-1"
                                                            >
                                                                webhook docs
                                                            </a>
                                                            {`).`}
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>
                                        {webhookSecondaryEditMode && (
                                            <form className="mt-2" onSubmit={handleWebhookSecondaryEditSave}>
                                                <div className="flex">
                                                    <input
                                                        id="webhook_url_secondary"
                                                        name="webhook_url_secondary"
                                                        autoComplete="new-password"
                                                        type="url"
                                                        defaultValue={webhookUrlSecondary}
                                                        className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                                    />

                                                    <button
                                                        type="submit"
                                                        className="border-border-blue bg-bg-dark-blue active:ring-border-blue flex h-11 rounded-md border ml-4 px-4 pt-3 text-sm font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </form>
                                        )}
                                        {!webhookSecondaryEditMode && (
                                            <div className="flex">
                                                <Prism language="bash" colorScheme="dark" className="w-full">
                                                    {webhookUrlSecondary || '\u0000'}
                                                </Prism>
                                                <button
                                                    onClick={() => setWebhookSecondaryEditMode(!webhookSecondaryEditMode)}
                                                    className="hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                >
                                                    Edit
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex items-center mb-2">
                                    <label htmlFor="send_webhooks_for_empty" className="text-text-light-gray text-sm font-semibold">
                                        Send Webhooks For Empty Sync Responses
                                    </label>
                                    <Tooltip
                                        text={
                                            <>
                                                <div className="flex text-black text-sm">
                                                    {`If checked, a webhook wil be sent on every sync run completion, even if no data has changed.`}
                                                </div>
                                            </>
                                        }
                                    >
                                        <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                    </Tooltip>
                                    <input
                                        type="checkbox"
                                        className="flex ml-3 bg-black"
                                        checked={alwaysSendWebhook}
                                        onChange={(event) => handleWebookSendUpdate(event.target.checked)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex items-center mb-2">
                                    <label htmlFor="send_webhooks_for_creation" className="text-text-light-gray text-sm font-semibold">
                                        Send New Connection Creation Webhooks
                                    </label>
                                    <Tooltip
                                        text={
                                            <>
                                                <div className="flex text-black text-sm">
                                                    {`If checked, a webhook will be sent on connection creation success or failure.`}
                                                </div>
                                            </>
                                        }
                                    >
                                        <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                    </Tooltip>
                                    <input
                                        type="checkbox"
                                        className="flex ml-3 bg-black"
                                        checked={sendAuthWebhook}
                                        onChange={(event) => handleWebookSendAuth(event.target.checked)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8 relative">
                                <div className="flex mb-2">
                                    <div className="flex text-white mb-2">
                                        <div className="flex">
                                            <label htmlFor="hmac key" className="text-text-light-gray block text-sm font-semibold">
                                                HMAC Key
                                            </label>
                                            <Tooltip
                                                text={
                                                    <>
                                                        <div className="flex text-black text-sm">
                                                            {`To secure the Frontend SDK calls with`}
                                                            <a
                                                                href="https://docs.nango.dev/integrate/guides/authorize-an-api#secure-the-frontend-sdk"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-text-blue ml-1"
                                                            >
                                                                HMAC
                                                            </a>
                                                            {`.`}
                                                        </div>
                                                    </>
                                                }
                                            >
                                                <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                            </Tooltip>
                                        </div>
                                    </div>
                                </div>
                                {!hmacEditMode && (
                                    <div className="flex">
                                        <SecretInput disabled optionalvalue={hmacKey} setoptionalvalue={setHmacKey} additionalclass="w-full" tall />
                                        <button
                                            onClick={() => setHmacEditMode(!hmacEditMode)}
                                            className="hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                )}
                                {hmacEditMode && (
                                    <form className="mt-2" onSubmit={handleHmacSave}>
                                        <div className="flex">
                                            <input
                                                id="hmac_key"
                                                name="hmac_key"
                                                autoComplete="new-password"
                                                type="text"
                                                value={hmacKey || ''}
                                                onChange={(event) => setHmacKey(event.target.value)}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border px-3 py-2 text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                            />
                                            <button
                                                type="submit"
                                                className="border-border-blue bg-bg-dark-blue active:ring-border-blue flex h-11 rounded-md border ml-4 px-4 pt-3 text-sm font-semibold text-blue-500 shadow-sm hover:border-2 active:ring-2 active:ring-offset-2"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex items-center mb-2">
                                    <label htmlFor="hmac_enabled" className="text-text-light-gray text-sm font-semibold">
                                        HMAC Enabled
                                    </label>
                                    <input
                                        type="checkbox"
                                        className="flex ml-3 bg-black"
                                        checked={hmacEnabled}
                                        onChange={(event) => handleHmacEnabled(event.target.checked)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div>
                            <div className="mx-8 mt-8">
                                <div className="flex items-center mb-2">
                                    <label htmlFor="email" className="text-text-light-gray text-sm font-semibold">
                                        Environment Variables
                                    </label>
                                    <Tooltip
                                        text={
                                            <div className="flex text-black text-sm">Set environment variables to be used inside sync and action scripts.</div>
                                        }
                                    >
                                        <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                    </Tooltip>
                                </div>
                                <form className="mt-2" onSubmit={handleEnvVariablesSave}>
                                    {envVariables.map((envVar, index) => (
                                        <div key={envVar.id || `${envVar.name}_${index}`} className="flex items-center mt-2">
                                            <input
                                                id={`env_var_name_${envVar.id || index}`}
                                                name={`${envVar.id || index}-env_var_name_${index}`}
                                                defaultValue={envVar.name}
                                                autoComplete="new-password"
                                                required
                                                type="text"
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none mr-3"
                                            />
                                            <input
                                                id={`env_var_value_${envVar.id || index}`}
                                                name={`${envVar.id || index}-env_var_value_${index}`}
                                                defaultValue={envVar.value}
                                                required
                                                autoComplete="new-password"
                                                type="password"
                                                onMouseEnter={(e) => (e.currentTarget.type = 'text')}
                                                onMouseLeave={(e) => {
                                                    if (document.activeElement !== e.currentTarget) {
                                                        e.currentTarget.type = 'password';
                                                    }
                                                }}
                                                onFocus={(e) => (e.currentTarget.type = 'text')}
                                                onBlur={(e) => (e.currentTarget.type = 'password')}
                                                className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                            />
                                            <button
                                                onClick={() => handleRemoveEnvVariable(index)}
                                                className="flex hover:bg-hover-gray text-white h-11 ml-4 px-4 pt-3 text-sm"
                                                type="button"
                                            >
                                                <TrashIcon className="flex h-5 w-5 text-white" />
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex justify-end mt-4">
                                        <button
                                            onClick={handleAddEnvVariable}
                                            className="hover:bg-hover-gray bg-gray-800 text-white flex h-11 rounded-md px-4 pt-3 text-sm mr-4"
                                            type="button"
                                        >
                                            Add Environment Variable
                                        </button>
                                        <button type="submit" className="hover:bg-gray-200 bg-white text-gray-700 flex h-11 rounded-md px-4 pt-3 text-sm">
                                            Save Environment Variable
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
};
