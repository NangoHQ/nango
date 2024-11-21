import { useMeta } from '../hooks/useMeta';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useEffect } from 'react';

export const Root: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const showGettingStarted = useStore((state) => state.showGettingStarted);
    const env = useStore((state) => state.env);
    const { meta } = useMeta();

    useEffect(() => {
        if (!meta) {
            return;
        }

        if (env === 'dev' && showGettingStarted && !meta.onboardingComplete) {
            navigate('/dev/getting-started');
            return;
        }

        navigate(`/${env}/`);
    }, [meta, location, env, navigate, showGettingStarted]);

    return null;
};
