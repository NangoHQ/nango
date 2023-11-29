import { toast } from 'react-toastify';
import { Prism } from '@mantine/prism';
import { useState, useEffect } from 'react';
import { AlertTriangle, HelpCircle } from '@geist-ui/icons';
import { TrashIcon } from '@heroicons/react/24/outline';
import { Tooltip, useModal, Modal } from '@geist-ui/core';
import Nango from '@nangohq/frontend';

import {
    useGetProjectInfoAPI,
    useEditCallbackUrlAPI,
    useEditWebhookUrlAPI,
    useEditHmacEnabledAPI,
    useEditHmacKeyAPI,
    useEditEnvVariablesAPI,
    useEditAlwaysSendWebhookAPI
} from '../utils/api';
import { isCloud, defaultCallback } from '../utils/utils';
import DashboardLayout from '../layout/DashboardLayout';
import { LeftNavBarItems } from '../components/LeftNavBar';
import SecretInput from '../components/ui/input/SecretInput';
import { useStore } from '../store';
import Button from '../components/ui/button/Button';

export default function ProjectSettings() {
    const [loaded, setLoaded] = useState(false);
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

    const [slackIsConnected, setSlackIsConnected] = useState(false);

    const [hmacKey, setHmacKey] = useState('');
    const [hmacEnabled, setHmacEnabled] = useState(false);
    const [accountUUID, setAccountUUID] = useState<number>();
    const [alwaysSendWebhook, setAlwaysSendWebhook] = useState(false);
    const [hmacEditMode, setHmacEditMode] = useState(false);
    const [envVariables, setEnvVariables] = useState<{ id?: number, name: string; value: string }[]>([]);
    const getProjectInfoAPI = useGetProjectInfoAPI();
    const editCallbackUrlAPI = useEditCallbackUrlAPI();
    const editWebhookUrlAPI = useEditWebhookUrlAPI();
    const editHmacEnabled = useEditHmacEnabledAPI();
    const editAlwaysSendWebhook = useEditAlwaysSendWebhookAPI();
    const editHmacKey = useEditHmacKeyAPI();
    const editEnvVariables = useEditEnvVariablesAPI();

    const { setVisible, bindings } = useModal()
    const { setVisible: setSecretVisible, bindings: secretBindings } = useModal()

    const env = useStore((state) => state.cookieValue);

    useEffect(() => {
        setEnvVariables(envVariables.filter((env) => env.id ));
        setLoaded(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [env]);

    useEffect(() => {
        const getAccount = async () => {
            let res = await getProjectInfoAPI();

            if (res?.status === 200) {
                const account = (await res.json())['account'];
                setSecretKey(account.pending_secret_key || account.secret_key);
                setSecretKeyRotatable(account.secret_key_rotatable !== false);
                setHasPendingSecretKey(Boolean(account.pending_secret_key));

                setPublicKey(account.pending_public_key || account.public_key);
                setPublicKeyRotatable(account.public_key_rotatable !== false);
                setHasPendingPublicKey(Boolean(account.pending_public_key));

                setCallbackUrl(account.callback_url || defaultCallback());

                setWebhookUrl(account.webhook_url || '');
                setHostUrl(account.host);
                setAccountUUID(account.uuid);

                setHmacEnabled(account.hmac_enabled);
                setAlwaysSendWebhook(account.always_send_webhook);
                setHmacKey(account.hmac_key);

                setSlackIsConnected(account.slack_notifications);

                setEnvVariables(account.env_variables);
            }
       };

        if (!loaded) {
            setLoaded(true);
            getAccount();
        }
    }, [getProjectInfoAPI, loaded, setLoaded, env]);

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
        }
    };

    const handleWebhookbackSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const target = e.target as typeof e.target & {
            webhook_url: { value: string };
        };

        const res = await editWebhookUrlAPI(target.webhook_url.value);

        if (res?.status === 200) {
            toast.success('Wehook URL updated!', { position: toast.POSITION.BOTTOM_CENTER });
            setWebhookEditMode(false);
            setWebhookUrl(target.webhook_url.value);
        }
    };

    const handleCallbackEdit = (_: React.SyntheticEvent) => {
        setCallbackEditMode(true);
    };

    const handleHmacEnabled = async (checked: boolean) => {
        if (!hmacKey && checked) {
            toast.error('Cannot enable HMAC without an HMAC key.', { position: toast.POSITION.BOTTOM_CENTER });
        } else {
            setHmacEnabled(checked);
            editHmacEnabled(checked).then((_) => {
                toast.success(checked ? 'HMAC enabled.' : 'HMAC disabled.', { position: toast.POSITION.BOTTOM_CENTER });
            });
        }
    };

    const handleWebookSendUpdate = async (checked: boolean) => {
        setAlwaysSendWebhook(checked);
        editAlwaysSendWebhook(checked).then((_) => {
            toast.success(checked ? 'Always send webhooks.' : 'Only send webhhoks on added, updated, or deleted.', { position: toast.POSITION.BOTTOM_CENTER });
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
        }

        setHmacEditMode(false);
    };

    const handleEnvVariablesSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();

        const formData = new FormData(e.target as HTMLFormElement);
        const entries = Array.from(formData.entries());

        const envVariablesArray = entries.reduce((acc, [key, value]) => {
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
        }, [] as Array<{ name: string; value: string }>);

        const res = await editEnvVariables(envVariablesArray);

        if (res?.status === 200) {
            toast.success('Environment variables updated!', { position: toast.POSITION.BOTTOM_CENTER });
        }
    };

    const handleAddEnvVariable = () => {
        setEnvVariables([...envVariables, { name: '', value: '' }]);
    };

    const handleRemoveEnvVariable = async (index: number) => {
        setEnvVariables(envVariables.filter((_, i) => i !== index));

        const strippedEnvVariables = envVariables.filter((_, i) => i !== index).filter((envVariable) => envVariable.name && envVariable.value);
        const res = await editEnvVariables(strippedEnvVariables as unknown as Array<Record<string,string>>);

        if (res?.status === 200) {
            toast.success('Environment variables updated!', { position: toast.POSITION.BOTTOM_CENTER });
        }
    };

    const handleActivatePublicKey = async () => {
        setVisible(true);
    };

    const handleActivateSecretKey = async () => {
        setSecretVisible(true);
    };

    const onRotateKey = async (publicKey = true) => {
        const res = await fetch('/api/v1/environment/rotate-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: publicKey ? 'public' : 'secret'
            })
        });

        if (res?.status === 200) {
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
        }
    };

    const onRevertKey = async (publicKey = true) => {
        const res = await fetch('/api/v1/environment/revert-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: publicKey ? 'public' : 'secret'
            })
        });

        if (res?.status === 200) {
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
        }
    };

    const onActivateKey = async(publicKey = true) => {
        const res = await fetch('/api/v1/environment/activate-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: publicKey ? 'public' : 'secret'
            })
        });

        if (res?.status === 200) {
            if (publicKey) {
                toast.success('New public key activated', { position: toast.POSITION.BOTTOM_CENTER });
                setVisible(false);
                setHasPendingPublicKey(false);
            } else {
                toast.success('New secret key activated', { position: toast.POSITION.BOTTOM_CENTER });
                setSecretVisible(false);
                setHasPendingSecretKey(false);
            }
        }
    };

    const updateSlackNotifications = async (enabled: boolean) => {
        await fetch('/api/v1/environment/slack-notifications-enabled', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                slack_notifications: enabled
            })
        });
    }

    const disconnectSlack = async () => {
        await updateSlackNotifications(false);

        const res = await fetch(`/api/v1/connection/admin/account-${accountUUID}`, {
            method: 'DELETE'
        });

        if (res?.status !== 204) {
            toast.error('There was a problem when disconnecting Slack', { position: toast.POSITION.BOTTOM_CENTER });
        } else {
            toast.success('Slack was disconnected successfully.', { position: toast.POSITION.BOTTOM_CENTER });
            setSlackIsConnected(false);
        }
    }

    const connectSlack = async () => {
        const connectionId =  `account-${accountUUID}`;

        const res = await fetch(`/api/v1/environment/admin-auth?connection_id=${connectionId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (res?.status !== 200) {
            toast.error('Something went wrong during the lookup for the Slack connect', { position: toast.POSITION.BOTTOM_CENTER });
            return;
        }

        const authResponse = await res.json();
        const { hmac_digest: hmacDigest, public_key: publicKey, integration_key: integrationKey } = authResponse;

        const nango = new Nango({ host: hostUrl, publicKey });
        nango.auth(integrationKey, connectionId, {
                user_scope: [],
                params: {},
                hmac: hmacDigest,
            })
            .then(async () => {
                await updateSlackNotifications(true);
                setSlackIsConnected(true);
                toast.success('Slack connection created!', { position: toast.POSITION.BOTTOM_CENTER });
            })
            .catch((err: { message: string; type: string }) => {
                console.log(err);
            });
    };

    return (
        <DashboardLayout selectedItem={LeftNavBarItems.ProjectSettings}>
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
                          <p>Make sure your code uses the new public key before activating. All authorization attempts with the previous public key will fail when the new key is activated.</p>
                        </Modal.Content>
                    </div>
                </div>
                <Modal.Action passive className="!text-lg" onClick={() => setVisible(false)}>Cancel</Modal.Action>
                <Modal.Action className="!bg-red-500 !text-white !text-lg" onClick={() => onActivateKey()}>Activate</Modal.Action>
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
                          <p>Make sure your code uses the new secret key before activating. All requests made with the previous secret key will fail as soon as the new key is activated.</p>
                        </Modal.Content>
                    </div>
                </div>
                <Modal.Action passive className="!text-lg" onClick={() => setSecretVisible(false)}>Cancel</Modal.Action>
                <Modal.Action className="!bg-red-500 !text-white !text-lg" onClick={() => onActivateKey(false)}>Activate</Modal.Action>
            </Modal>
            {secretKey && (
                <div className="mx-auto w-largebox">
                    <div className="mx-20 h-full mb-20">
                        <h2 className="mt-16 text-left text-3xl font-semibold tracking-tight text-white mb-12">Project Settings</h2>
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
                                                            href="https://docs.nango.dev/sdks/frontend"
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
                                                    onClick={() => hasPendingPublicKey ? onRevertKey() : onRotateKey()}
                                                    className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                >
                                                    {hasPendingPublicKey ? 'Revert' : 'Rotate'}
                                                </button>
                                                <button
                                                    onClick={handleActivatePublicKey}
                                                    className={`${hasPendingPublicKey ? 'hover:bg-gray-700 bg-gray-800' : 'opacity-50'} text-red-500 flex h-11 rounded-md ml-2 px-4 pt-3 text-sm`}
                                                    disabled={!hasPendingPublicKey}
                                                >
                                                    Activate
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {hasPendingPublicKey && (
                                        <div className=" text-red-500 text-sm">
                                            Click 'Activate' to use this new key. Until then, Nango expects the old key. After activation the old key won't work.
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
                                                            href="https://docs.nango.dev/sdks/cli"
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-text-blue ml-1"
                                                        >
                                                            CLI
                                                        </a>
                                                        {`, `}
                                                        <a
                                                            href="https://docs.nango.dev/sdks/node"
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="text-text-blue ml-1 mr-1"
                                                        >
                                                            Backend SDKs
                                                        </a>
                                                        {` and `}
                                                        <a
                                                            href="https://docs.nango.dev/api-reference/authentication"
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
                                        <SecretInput additionalclass="w-full" disabled copy={true} optionalvalue={secretKey} setoptionalvalue={setSecretKey} />
                                        {secretKeyRotatable && (
                                            <>
                                                <button
                                                    onClick={() => hasPendingSecretKey ? onRevertKey(false) : onRotateKey(false)}
                                                    className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                                >
                                                    {hasPendingSecretKey ? 'Revert' : 'Rotate'}
                                                </button>
                                                <button
                                                    onClick={handleActivateSecretKey}
                                                    className={`${hasPendingSecretKey ? 'hover:bg-gray-700 bg-gray-800' : 'opacity-50'} text-red-500 flex h-11 rounded-md ml-2 px-4 pt-3 text-sm`}
                                                    disabled={!hasPendingSecretKey}
                                                >
                                                    Activate
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {hasPendingSecretKey && (
                                        <div className=" text-red-500 text-sm">
                                            Click 'Activate' to use this new key. Until then, Nango expects the old key. After activation the old key won't work.
                                        </div>
                                    )}
                                </div>
                            </div>
                            {env === 'prod' && (
                                <div className="flex items-center justify-between mx-8 mt-8">
                                    <div>
                                        <label htmlFor="slack_alerts" className="flex text-text-light-gray items-center block text-sm font-semibold mb-2">
                                            Slack Alerts
                                        <Tooltip
                                            text={
                                                <div className="flex text-black text-sm">
                                                    {slackIsConnected ?
                                                        'Stop receiving Slack alerts to a public channel of your choice when a syncs or actions fail.' :
                                                        'Receive Slack alerts to a public channel of your choice when a syncs or actions fail.'
                                                    }
                                                </div>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                        </label>
                                    </div>
                                    <div className="">
                                        <Button className="items-center" variant="primary" onClick={slackIsConnected ? disconnectSlack : connectSlack}>
                                            <img src={`images/template-logos/slack.svg`} alt="" className="flex h-7 pb-0.5" />
                                            {slackIsConnected ? 'Disconnect' : 'Connect'}
                                        </Button>
                                    </div>
                                </div>
                            )}
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
                                                                href="https://docs.nango.dev/guides/oauth#custom-callback-url"
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
                                                className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
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
                                                            href="https://docs.nango.dev/guides/webhooks"
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
                                        <form className="mt-2" onSubmit={handleWebhookbackSave}>
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
                                                className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
                                            >
                                                Edit
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="mx-8 mt-8">
                                    <div className="flex items-center mb-2">
                                        <label htmlFor="hmac_enabled" className="text-text-light-gray text-sm font-semibold">
                                            Always Send Webhooks
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
                                <div className="mx-8 mt-8 relative">
                                    <div className="flex mb-2">
                                        <div className="flex text-white  mb-2">
                                            <div className="flex">
                                                <label htmlFor="hmac key" className="text-text-light-gray block text-sm font-semibold mb-2">
                                                    HMAC Key
                                                </label>
                                                <Tooltip
                                                    text={
                                                        <>
                                                            <div className="flex text-black text-sm">
                                                                {`To secure the Frontend SDK calls with`}
                                                                <a
                                                                    href="https://docs.nango.dev/guides/advanced-auth#securing-the-frontend-sdk-calls-with-hmac"
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
                                            <SecretInput disabled optionalvalue={hmacKey} setoptionalvalue={setHmacKey} additionalclass="w-full" />
                                            <button
                                                onClick={() => setHmacEditMode(!hmacEditMode)}
                                                className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md ml-4 px-4 pt-3 text-sm"
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
                                                    value={hmacKey}
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
                                                <div className="flex text-black text-sm">
                                                    Set environment variables to be used inside sync and action scripts.
                                                </div>
                                            }
                                        >
                                            <HelpCircle color="gray" className="h-5 ml-1"></HelpCircle>
                                        </Tooltip>
                                    </div>
                                    <form
                                        className="mt-2"
                                        onSubmit={handleEnvVariablesSave}
                                    >
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
                                                    onMouseEnter={(e) => e.currentTarget.type = 'text'}
                                                    onMouseLeave={(e) => {
                                                        if (document.activeElement !== e.currentTarget) {
                                                            e.currentTarget.type = 'password';
                                                        }
                                                    }}
                                                    onFocus={(e) => e.currentTarget.type = 'text'}
                                                    onBlur={(e) => e.currentTarget.type = 'password'}
                                                    className="border-border-gray bg-bg-black text-text-light-gray focus:ring-blue block h-11 w-full appearance-none rounded-md border text-base placeholder-gray-600 shadow-sm focus:border-blue-500 focus:outline-none"
                                                />
                                                <button
                                                    onClick={() => handleRemoveEnvVariable(index)}
                                                    className="flex hover:bg-gray-700 border border-border-gray text-white h-11 ml-4 px-4 pt-3 text-sm"
                                                    type="button"
                                                >
                                                    <TrashIcon className="flex h-5 w-5 text-white" />
                                                </button>
                                            </div>
                                        ))}
                                        <div className="flex justify-end mt-4">
                                            <button
                                                onClick={handleAddEnvVariable}
                                                className="hover:bg-gray-700 bg-gray-800 text-white flex h-11 rounded-md px-4 pt-3 text-sm mr-4"
                                                type="button"
                                            >
                                                Add Environment Variable
                                            </button>
                                            <button
                                                type="submit"
                                                className="hover:bg-gray-200 bg-white text-gray-700 flex h-11 rounded-md px-4 pt-3 text-sm"
                                            >
                                                Save Environment Variable
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
