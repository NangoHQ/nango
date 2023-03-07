import { toast } from 'react-toastify';
import { NavigateFunction } from 'react-router';

class API {
    static async requestErrorToast() {
        toast.error('Request error...', { position: toast.POSITION.BOTTOM_CENTER });
    }

    static async serverErrorToast() {
        toast.error('Server error...', { position: toast.POSITION.BOTTOM_CENTER });
    }

    static async signup(name: string, email: string, password: string) {
        try {
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: name, email: email, password: password })
            };

            return fetch('/api/v1/signup', options);
        } catch (e) {
            this.requestErrorToast();
        }
    }

    static async signin(email: string, password: string) {
        try {
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
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

    static async getProjectInfo(nav: NavigateFunction) {
        try {
            let res = await fetch('/api/v1/account');

            if (res.status === 401) {
                return nav('/signin', { replace: true });
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    static async editCallbackUrl(callbackUrl: string, nav: NavigateFunction) {
        try {
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ callback_url: callbackUrl })
            };

            let res = await fetch('/api/v1/account/callback', options);

            if (res.status === 401) {
                return nav('/signin', { replace: true });
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    static async getIntegrationList(nav: NavigateFunction) {
        try {
            let res = await fetch('/api/v1/integration');

            if (res.status === 401) {
                return nav('/signin', { replace: true });
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    static async createIntegration(provider: string, providerConfigKey: string, clientId: string, clientSecret: string, scopes: string, nav: NavigateFunction) {
        try {
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
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
                return nav('/signin', { replace: true });
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    static async getProviders(nav: NavigateFunction) {
        try {
            let res = await fetch('/api/v1/provider');

            if (res.status === 401) {
                return nav('/signin', { replace: true });
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    static async getConnectionList(nav: NavigateFunction) {
        try {
            let res = await fetch('/api/v1/connection');

            if (res.status === 401) {
                return nav('/signin', { replace: true });
            }

            if (res.status !== 200) {
                return this.serverErrorToast();
            }

            return res;
        } catch (e) {
            this.requestErrorToast();
        }
    }

    static async getConnectionDetails(connectionId: string, providerConfigKey: string, nav: NavigateFunction) {
        try {
            let res = await fetch(
                `/api/v1/connection/details?connection_id=${encodeURIComponent(connectionId)}&provider_config_key=${encodeURIComponent(providerConfigKey)}`
            );

            if (res.status === 401) {
                return nav('/signin', { replace: true });
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
export default API;
