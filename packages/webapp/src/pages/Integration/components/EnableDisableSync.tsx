import { useState } from 'react';
import { toast } from 'react-toastify';
import { useModal } from '@geist-ui/core';
import ActionModal from '../../../components/ui/ActionModal';
import ToggleButton from '../../../components/ui/button/ToggleButton';
import type { Flow, Connection } from '../../../types';
import { useCreateFlow } from '../../../utils/api';

export interface FlowProps {
    flow: Flow;
    provider: string;
    providerConfigKey: string;
    reload?: () => void;
    setLoaded?: (loaded: boolean) => void;
    rawName?: string;
    connections: Connection[];
}

export default function EnableDisableSync({ flow, provider, providerConfigKey, reload, setLoaded, rawName, connections }: FlowProps) {
    const { setVisible, bindings } = useModal();
    const createFlow = useCreateFlow();
    const connectionIds = connections.map(connection => connection.id);

    const [modalTitle, setModalTitle] = useState('');
    const [modalContent, setModalContent] = useState('');
    const [modalAction, setModalAction] = useState<(() => void) | null>(null);
    const [modalShowSpinner, setModalShowSpinner] = useState(false);
    const [modalTitleColor, setModalTitleColor] = useState('text-white');

    const enableSync = (flow: Flow) => {
        setModalTitle(`Enable ${flow.type}?`);
        setModalTitleColor('text-white')
        const content = flow?.type === 'sync' ?
            'Records will start syncing potentially for multiple connections. This will impact your billing.' :
            'This will make the action available for immediate use.';
        setModalContent(content);
        setModalAction(() => () => onEnableSync(flow));
        setVisible(true);
    }

    const onEnableSync = async (flow: Flow) => {
        const flowPayload = {
            provider,
            providerConfigKey,
            type: flow.type,
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
            public_route: rawName || provider
        };

        setModalShowSpinner(true);
        const res = await createFlow([flowPayload]);
        if (res?.status === 201) {
            if (reload) {
                reload();
            }
            if (setLoaded) {
                setLoaded(false);
            }
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
            const title = 'Custom syncs cannot be disabled from the UI';
            const message = flow.pre_built ?
                'If you want to disable this sync, ask the Nango team or download the code and deploy it as a custom sync.' :
                'If you want to disable this sync, remove it from your `nango.yaml` configuration file.';
            setModalTitleColor('text-white')
            setModalTitle(title);
            setModalContent(message)
            setModalAction(null);
            setVisible(true);

            return;
        }

        setModalTitle(`Disable ${flow?.type === 'sync' ? 'sync? (destructive action)' : 'action?'}`);
        setModalTitleColor('text-pink-600')
        const content = flow?.type === 'sync' ?
            'Disabling this sync will result in the deletion of all related synced records potentially for multiple connections. The endpoints to fetch these records will no longer work.' :
            'This will make the action unavailable for immediate use.'
        setModalContent(content);
        setModalAction(() => () => onDisableSync(flow));
        setVisible(true);
    }

    const onDisableSync = async (flow: Flow) => {
        setModalShowSpinner(true);
        const res = await fetch(`/api/v1/flow/${flow?.id}?sync_name=${flow.name}&connectionIds=${connectionIds.join(',')}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
        });

        if (res.status === 204) {
            if (reload) {
                reload();
            }
            if (setLoaded) {
                setLoaded(false);
            }
        } else {
            toast.error('Something went wrong', {
                position: toast.POSITION.BOTTOM_CENTER
            });
        }
        setModalShowSpinner(false);
        setVisible(false);
    }

    const toggleSync = async (flow: Flow) => {
        const active = 'version' in flow && flow.version !== null;
        if (active) {
            (flow?.type === 'sync' ? await disableSync(flow) : await onDisableSync(flow));
        } else {
            (flow?.type === 'sync' ? await enableSync(flow) : await onEnableSync(flow));
        }
    }

    return (
        <>
            <ActionModal
                bindings={bindings}
                modalTitle={modalTitle}
                modalContent={modalContent}
                modalAction={modalAction}
                modalShowSpinner={modalShowSpinner}
                modalTitleColor={modalTitleColor}
                setVisible={setVisible}
            />
            <ToggleButton enabled={Boolean('version' in flow && flow.version !== null)} onChange={() => toggleSync(flow)} />
        </>
    );
}
