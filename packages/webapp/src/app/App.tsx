import { useEffect, useRef } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useLocalStorage } from 'react-use';
import { Toaster } from 'sonner';

import { PlainChat } from '@/components/PlainChat';
import { DevToolPanel, useIsDevToolsEnabled } from '@/features/DevToolPanel';
import { useMeta } from '@/hooks/useMeta';
import { useUser } from '@/hooks/useUser';
import { useTheme } from '@/lib/theme';
import { useStore } from '@/store';
import { globalEnv } from '@/utils/env';
import { LocalStorageKeys } from '@/utils/local-storage';
import { router } from './router';

const App = () => {
    const env = useStore((state) => state.env);
    const isDevToolsEnabled = useIsDevToolsEnabled();
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
            {meta?.demoBanner && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 9999,
                        background: 'linear-gradient(90deg, #ff0080, #ff8c00, #ffe600)',
                        color: '#000',
                        fontWeight: 800,
                        fontSize: '18px',
                        textAlign: 'center',
                        padding: '12px',
                        letterSpacing: '0.05em'
                    }}
                >
                    🚩 FEATURE FLAG IS ON — this banner is rendered from a backend Unleash flag 🚩
                </div>
            )}
            <PlainChat user={user} />
            <RouterProvider router={router} />
            <Toaster />
            {isDevToolsEnabled && <DevToolPanel />}
        </>
    );
};

export default App;
