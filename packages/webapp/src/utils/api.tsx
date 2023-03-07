import { toast } from 'react-toastify';
import { NavigateFunction } from 'react-router';
import storage, { LocalStorageKeys } from './local-storage';
import { Buffer } from 'buffer';

class API {
    private requestErrorToast() {
        toast.error('Request error...', { position: toast.POSITION.BOTTOM_CENTER });
    }

    private serverErrorToast() {
        toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
    }

    private logoutFromClient(nav: NavigateFunction) {
        storage.clear();
        nav('/signin', { replace: true });
    }

    private getHeaders() {
        let headers: Record<string, string> = { 'Content-Type': 'application/json' };

        if (process.env['REACT_APP_ENV'] === 'hosted') {
            let username = storage.getItem(LocalStorageKeys.Username);
            let password = storage.getItem(LocalStorageKeys.Password);

            if (username && password) {
                headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
            }
        }

        return headers;
    }

    async logout(nav: NavigateFunction) {
        const options = {
            method: 'POST',
            headers: this.getHeaders()
        };

        await fetch('/api/v1/logout', options);
        this.logoutFromClient(nav);
    }

    async signup(name: string, email: string, password: string) {
        try {
            const options = {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ name: name, email: email, password: password })
            };

            return fetch('/api/v1/signup', options);
        } catch (e) {
            this.requestErrorToast();
        }
    }

    async signin(email: string, password: string) {
        try {
            const options = {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ email: email, password: password })
            };

            let res = await fetch('/api/v1/signin', options);

            if (res.status !== 200 && res.status !== 401) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    async hostedSignin() {
        try {
            let res = await fetch('/api/v1/basic', { headers: this.getHeaders() });

            if (res.status !== 200 && res.status !== 401) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    async getProjectInfo(nav: NavigateFunction) {
        try {
            let res = await fetch('/api/v1/account', { headers: this.getHeaders() });

            if (res.status === 401) {
                return this.logoutFromClient(nav);
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    async editCallbackUrl(callbackUrl: string, nav: NavigateFunction) {
        try {
            const options = {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({ callback_url: callbackUrl })
            };

            let res = await fetch('/api/v1/account/callback', options);

            if (res.status === 401) {
                return this.logoutFromClient(nav);
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    async getIntegrationList(nav: NavigateFunction) {
        try {
            let res = await fetch('/api/v1/integration', { headers: this.getHeaders() });

            if (res.status === 401) {
                return this.logoutFromClient(nav);
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    async createIntegration(provider: string, providerConfigKey: string, clientId: string, clientSecret: string, scopes: string, nav: NavigateFunction) {
        try {
            const options = {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    provider: provider,
                    provider_config_key: providerConfigKey,
                    client_id: clientId,
                    client_secret: clientSecret,
                    scopes: scopes
                })
            };

            let res = await fetch('/api/v1/integration', options);

            if (res.status === 401) {
                return this.logoutFromClient(nav);
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    async getProviders(nav: NavigateFunction) {
        try {
            let res = await fetch('/api/v1/provider', { headers: this.getHeaders() });

            if (res.status === 401) {
                return this.logoutFromClient(nav);
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    async getConnectionList(nav: NavigateFunction) {
        try {
            let res = await fetch('/api/v1/connection', { headers: this.getHeaders() });

            if (res.status === 401) {
                return this.logoutFromClient(nav);
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    async getConnectionDetails(connectionId: string, providerConfigKey: string, nav: NavigateFunction) {
        try {
            let res = await fetch(
                `/api/v1/connection/details?connection_id=${encodeURIComponent(connectionId)}&provider_config_key=${encodeURIComponent(providerConfigKey)}`,
                { headers: this.getHeaders() }
            );

            if (res.status === 401) {
                return this.logoutFromClient(nav);
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }
}

const api = new API();
export default api;
