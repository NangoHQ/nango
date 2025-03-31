import type { FC } from 'react';
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import storage, { LocalStorageKeys } from '../utils/local-storage';

export const AutoRedirect: FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const env = useStore((state) => state.env);

    useEffect(() => {
        if (env) {
            storage.setItem(LocalStorageKeys.LastEnvironment, env);
        }
    }, [env]);

    useEffect(() => {
        const lastEnv = storage.getItem(LocalStorageKeys.LastEnvironment);
        if (location.pathname === '/' && lastEnv) {
            navigate(`/${lastEnv}`, { replace: true });
        }
    }, [navigate, location.pathname]);

    return null;
};
