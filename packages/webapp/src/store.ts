import create, { SetState, GetState } from 'zustand';
import Cookies from 'js-cookie';

interface State {
    cookieValue: string;
    setCookieValue: (value: string) => void;
}

export const useStore = create<State>((set: SetState<State>, get: GetState<State>) => ({
    cookieValue: Cookies.get('env') || '',
    setCookieValue: (value) => {
        Cookies.set('env', value);
        set({ cookieValue: value });
    },

    getCookieValue: () => {
        return get().cookieValue;
    }
}));
