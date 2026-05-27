import { useEffect, useRef } from 'react';
import { RouterProvider } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { useLocalStorage } from 'react-use';
import { Toaster } from 'sonner';

import { router } from './router';
import { DevToolPanel, isDevToolsEnabled } from '@/components-v2/DevToolPanel';
import { useMeta } from '@/hooks/useMeta';
import { useUser } from '@/hooks/useUser';
import { useStore } from '@/store';
import { useThemeStore } from '@/store/theme';
import { globalEnv } from '@/utils/env';
import { LocalStorageKeys } from '@/utils/local-storage';
import { applyTheme } from '@/utils/theme';

import 'react-toastify/dist/ReactToastify.css';

const App = () => {
    const env = useStore((state) => state.env);
    const setShowGettingStarted = useStore((state) => state.setShowGettingStarted);
    const darkMode = useThemeStore((state) => state.darkMode);

    // Sync theme state to DOM so CSS tokens respond to dark/light mode
    useEffect(() => {
        applyTheme(darkMode);
    }, [darkMode]);
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
            {/* TODO: Remove once remaining legacy toasts have been replaced */}
            <ToastContainer />
            <Toaster />
            {isDevToolsEnabled && <DevToolPanel />}
        </>
    );
};

export default App;
