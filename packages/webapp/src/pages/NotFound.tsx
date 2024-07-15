import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useEffect } from 'react';

const VALID_PATHS = [
    'interactive-demo',
    'integration',
    'integrations',
    'syncs',
    'connections',
    'project-settings',
    'environment-settings',
    'user-settings',
    'account-settings',
    'team-settings',
    'logs'
];

export const NotFound: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const showInteractiveDemo = useStore((state) => state.showInteractiveDemo);
    const env = useStore((state) => state.env);

    useEffect(() => {
        const pathSegments = location.pathname.split('/').filter(Boolean);
        // Add env in URL
        if (pathSegments[0] !== env && VALID_PATHS.includes(pathSegments[0])) {
            navigate(`/${env}/${pathSegments.join('/')}`);
            return;
        }

        navigate(`/${env}/integrations`);
    }, [location, env, navigate, showInteractiveDemo]);

    return null;
};
