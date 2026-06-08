import { useEffect, useRef } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useLocalStorage } from 'react-use';
import { Toaster } from 'sonner';

import { router } from './router';
import { DevToolPanel, isDevToolsEnabled } from '@/features/DevToolPanel';
import { useMeta } from '@/hooks/useMeta';
import { useUser } from '@/hooks/useUser';
import { useTheme } from '@/lib/theme';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import { LocalStorageKeys } from '@/utils/local-storage';

const App = () => {
    const env = useStore((state) => state.env);
    const setShowGettingStarted = useStore((state) => state.setShowGettingStarted);
    // Sync persisted theme preference to the DOM
    useTheme();
    const [_, setLastEnvironment] = useLocalStorage(LocalStorageKeys.LastEnvironment);
    const { user } = useUser();
    const { data: metaData } = useMeta(!!user);
    const meta = metaData?.data;

    useEffect(() => {
        setShowGettingStarted(env === 'dev' && globalEnv.features.gettingStarted);
        if (env) {
            setLastEnvironment(env);
        }
    }, [env, setShowGettingStarted, setLastEnvironment]);

    // Print the version and git hash to the console (only once)
    const hasPrintedVersion = useRef(false);
    useEffect(() => {
        if (!meta || hasPrintedVersion.current) {
            return;
        }

        hasPrintedVersion.current = true;
        console.log(`Nango v${meta.version} ${globalEnv.gitHash ? `(${globalEnv.gitHash})` : ''}`);
    }, [meta]);

    return (
        <>
            <RouterProvider router={router} />
            <Toaster />
            {isDevToolsEnabled && <DevToolPanel />}
        </>
    );
};

export default App;
