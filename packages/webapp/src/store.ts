import { create, SetState, GetState } from 'zustand';
import Cookies from 'js-cookie';

interface Env {
    name: string;
}

interface State {
    cookieValue: string;
    baseUrl: string;
    envs: Env[];
    email: string;
    showGettingStarted: boolean;
    setCookieValue: (value: string) => void;
    setEnvs: (envs: Env[]) => void;
    setBaseUrl: (value: string) => void;
    setEmail: (value: string) => void;
    setShowGettingStarted: (value: boolean) => void;
}

export const useStore = create<State>((set: SetState<State>, get: GetState<State>) => ({
    cookieValue: Cookies.get('env') || 'dev',
    envs: [{ name: 'dev' }, { name: 'prod' }],
    baseUrl: 'https://api.nango.dev',
    email: '',
    showGettingStarted: false,

    setCookieValue: (value) => {
        Cookies.set('env', value);
        set({ cookieValue: value });
    },

    setEnvs: (envs: Env[]) => {
        set({ envs });
    },

    getCookieValue: () => {
        return get().cookieValue;
    },

    getEnvs: () => {
        return get().envs;
    },

    setBaseUrl: (value) => {
        set({ baseUrl: value });
    },

    setEmail: (value) => {
        set({ email: value });
    },

    setShowGettingStarted: (value) => {
        set({ showGettingStarted: value });
    }
}));
