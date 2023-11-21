import { useState } from 'react';
import { toast } from 'react-toastify';
import { Tooltip } from '@geist-ui/core';
import { useModal, Modal } from '@geist-ui/core';
import { Integration, Flow, EndpointResponse } from './Show';
import Button from '../../components/ui/button/Button';
import { useCreateFlow } from '../../utils/api';
import Spinner from '../../components/ui/Spinner';

interface SyncConfigurationProps {
    endpoints: EndpointResponse;
    integration: Integration;
    setLoaded: (loaded: boolean) => void;
}

export default function SyncConfiguration(props: SyncConfigurationProps) {
    const { integration, endpoints, setLoaded } = props;
    const { setVisible, bindings } = useModal();
    const [modalTitle, setModalTitle] = useState('');
    const [modalContent, setModalContent] = useState('');
    const [modalAction, setModalAction] = useState<(() => void) | null>(null);
    const [modalShowSpinner, setModalShowSpinner] = useState(false);
    const [modalTitleColor, setModalTitleColor] = useState('text-white');
    const createFlow = useCreateFlow();

    const enableSync = (flow: Flow) => {
        setModalTitle('Enable sync?');
        setModalTitleColor('text-white')
        // TODO
        setModalContent('Records will start syncing potentially for multiple connections. This will impact your billing.');
        setModalAction(() => () => onEnableSync(flow));
        setVisible(true);
    }

    const onEnableSync = async (flow: Flow) => {
        const flowPayload = {
            provider: integration.provider,
            type: 'sync',
            name: flow.name,
            runs: flow.runs as string,
            auto_start: flow.auto_start === true,
            track_deletes: flow.track_deletes,
            sync_type: flow.sync_type,
            models: flow.models.map(model => model.name),
            scopes: flow.scopes,
            input: flow.input,
            returns: flow.returns,
            metadata: {
                description: flow.description,
                scopes: flow.scopes,
            },
            endpoints: flow.endpoints,
            output: flow.output,
            pre_built: flow.pre_built,
            is_public: flow.is_public,
            model_schema: JSON.stringify(flow.models),
            public_route: endpoints?.unEnabledFlows?.rawName || integration.provider
        };

        setModalShowSpinner(true);
        const res = await createFlow([flowPayload]);
        if (res?.status === 201) {
            setLoaded(false);
        } else {
            const payload = await res?.json();
            toast.error(payload.error, {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }
        setModalShowSpinner(false);
        setVisible(false);
    }

    const disableSync = (flow: Flow) => {
        if (!flow.is_public) {
        setModalTitleColor('text-white')
            setModalTitle('Only public syncs can be disabled');
            setModalContent('If you want to disable this sync, delete it from your `nango.yaml` configuration file.')
            setModalAction(null);
            setVisible(true);

            return;
        }

        setModalTitle('Disable sync? (destructive action)');
        setModalTitleColor('text-pink-600')
        // TODO
        setModalContent('Disabling this sync will result in the deletion of all related synced records potentially for multiple connections. The endpoints to fetch these records will no longer work.');
        setModalAction(() => () => onDisableSync(flow));
        setVisible(true);
    }

    const onDisableSync = async (flow: Flow) => {
        setModalShowSpinner(true);
        const res = await fetch(`/api/v1/flow/${flow?.id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
        });

        if (res.status === 204) {
            setLoaded(false);
        } else {
            toast.error('Something went wrong', {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }
        setModalShowSpinner(false);
        setVisible(false);
    }

    const toggleSync = async (flow: Flow) => {
        const active = 'version' in flow;
        if (active) {
            await disableSync(flow);
        } else {
            await enableSync(flow);
        }
    }

    return (
        <div className="h-fit rounded-md text-white text-sm">
            <Modal {...bindings} wrapClassName="!h-[200px] !w-[550px] !max-w-[550px] !bg-black no-border-modal">
                <div className="flex justify-between text-sm">
                    <div>
                        <Modal.Content className="overflow-scroll !h-[185px] max-w-[550px] flex flex-col justify-between h-full">
                            <div>
                                <span className="flex items-center">
                                    <h1 className={`${modalTitleColor} text-base mr-3`}>{modalTitle}</h1>
                                    {modalShowSpinner && (<Spinner size={2} />)}
                                </span>
                                <div className="mt-2 text-sm text-white">{modalContent}</div>
                            </div>
                            <div className="flex pb-2">
                                {modalAction && <Button className="mr-4" disabled={modalShowSpinner} variant="primary" onClick={modalAction}>Confirm</Button>}
                                <Button className="!text-text-light-gray" variant="zombie" onClick={() => setVisible(false)}>Cancel</Button>
                            </div>
                        </Modal.Content>
                    </div>
                </div>
            </Modal>
            <table className="w-[976px]">
                <tbody className="flex flex-col space-y-2">
                    <tr>
                        <td className="flex items-center px-3 justify-between text-xs px-2 py-2 bg-zinc-900 border border-neutral-800 rounded-md">
                            <div className="w-12">Scripts</div>
                            <div className="w-12">Models</div>
                            <div className="w-72">Description</div>
                            <div className="w-12">Source</div>
                            <div className="">Enabled</div>
                        </td>
                    </tr>
                    <tr>
                    {[...endpoints?.enabledFlows?.syncs || [], ...endpoints?.unEnabledFlows?.syncs || []].filter(flow => flow.endpoints && flow.endpoints.length > 0).map((flow) => (
                        <td key={flow.name} className="flex items-center p-3 py-5 justify-between border-b border-border-gray">
                            <div className="flex items-center w-36">
                                <span className="w-48">{flow.name}</span>
                            </div>
                            <div className="flex items-center w-36 -ml-8">
                                <Tooltip text={Array.isArray(flow.returns) ? flow.returns.join(', ') : flow.returns} type="dark">
                                    <div className="w-36 max-w-3xl truncate">{Array.isArray(flow.returns) ? flow.returns.join(', ') : flow.returns}</div>
                                </Tooltip>
                            </div>
                            <div className="flex items-center w-[22rem] -ml-8">
                                <Tooltip text={flow.description} type="dark">
                                    <div className="w-72 max-w-3xl truncate">{flow.description}</div>
                                </Tooltip>
                            </div>
                            <div className="flex items-center w-32">
                                {flow.is_public ? 'Public' :
                                    flow.pre_built ? 'Managed' :
                                    'Custom'
                                }
                            </div>
                            <div className="flex items-center">
                                   <label className="inline-flex items-center cursor-pointer">
                                    <span className="relative">
                                        <span className={`block w-7 h-3.5 ${'version' in flow ? 'bg-green-600' : 'bg-zinc-500'} rounded-full shadow-inner`}></span>
                                        <span className={`absolute block w-3 h-3 mt-[1px] ml-0.5 rounded-full shadow inset-y-0 left-0 focus-within:shadow-outline transition-transform duration-300 ease-in-out ${'version' in flow ? 'transform translate-x-full bg-black' : 'bg-black'}`}>
                                            <input type="checkbox" onChange={(() => toggleSync(flow))} className="absolute opacity-0 w-0 h-0" />
                                        </span>
                                    </span>
                                </label>
                            </div>
                        </td>
                    ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
}
