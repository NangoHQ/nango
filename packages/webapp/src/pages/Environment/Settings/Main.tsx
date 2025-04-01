import { IconSettings } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

import { EditableInput } from './EditableInput';
import { apiPatchEnvironment } from '../../../hooks/useEnvironment';
import { useMeta } from '../../../hooks/useMeta';
import { useStore } from '../../../store';

export const MainSettings: React.FC = () => {
    const env = useStore((state) => state.env);
    const setEnv = useStore((state) => state.setEnv);
    const { mutate: mutateMeta } = useMeta();

    return (
        <div className="text-grayscale-100 flex flex-col gap-10">
            <Link className="flex gap-2 items-center rounded-md bg-grayscale-900 px-8 h-10" to="#main" id="main">
                <div>
                    <IconSettings stroke={1} size={18} />
                </div>
                <h3 className="uppercase text-sm">Main</h3>
            </Link>
            <div className="px-8 flex flex-col gap-10 w-3/5">
                <EditableInput
                    title="Environment Name"
                    name="environmentName"
                    originalValue={env}
                    apiCall={(name) => apiPatchEnvironment(env, { name })}
                    onSuccess={async (newName) => {
                        // We have to start by changing the url, otherwise PrivateRoute will the env revert it based on it.
                        window.history.replaceState({}, '', `/${newName}/environment-settings`);
                        await mutateMeta();
                        setEnv(newName);
                    }}
                />
            </div>
        </div>
    );
};
