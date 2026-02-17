import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { PROD_ENVIRONMENT_NAME } from '../constants';
import { useMeta } from '../hooks/useMeta';
import { useStore } from '../store';

export const Root: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const showGettingStarted = useStore((state) => state.showGettingStarted);
    const env = useStore((state) => state.env);
    const { meta } = useMeta();
    const hasDev = meta?.environments.some((e) => e.name === 'dev');

    useEffect(() => {
        if (!meta) {
            return;
        }

        if (env === 'dev' && showGettingStarted && !meta.gettingStartedClosed) {
            if (!hasDev) {
                const randomEnv = meta.environments[0]?.name;
                navigate(`/${randomEnv}`, { replace: true });
                return;
            }
            navigate('/dev/getting-started');
            return;
        }

        if (location.pathname === '/' && env) {
            // Redirect to an env that exists; prefer prod (cannot be deleted/renamed)
            const targetEnv = meta.environments?.some((e) => e.name === env)
                ? env
                : (meta.environments?.find((e) => e.name === PROD_ENVIRONMENT_NAME)?.name ?? meta.environments?.[0]?.name ?? env);
            navigate(`/${targetEnv}`, { replace: true });
            return;
        }

        navigate(`/${env}/`);
    }, [meta, location, env, navigate, showGettingStarted]);

    return null;
};
