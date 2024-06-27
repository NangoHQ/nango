import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';
import http from 'node:http';
import type { Agent as HttpAgent } from 'node:http';
import type { Agent as HttpsAgent } from 'node:https';
import https from 'node:https';

export let httpAgent: HttpProxyAgent<string> | HttpAgent = new http.Agent();
export let httpsAgent: HttpsProxyAgent<string> | HttpsAgent = new https.Agent();

const hasHttpProxy = process.env['http_proxy'] || process.env['HTTP_PROXY'];
const hasHttpsProxy = process.env['https_proxy'] || process.env['HTTPS_PROXY'];

if (hasHttpProxy) {
    httpAgent = new HttpProxyAgent(hasHttpProxy);
}
if (hasHttpsProxy) {
    httpsAgent = new HttpsProxyAgent(hasHttpsProxy);
}

const config: AxiosRequestConfig = {
    httpAgent: httpAgent,
    httpsAgent: httpsAgent
};

if (hasHttpProxy || hasHttpsProxy) {
    config.proxy = false;
}

export const axiosInstance = axios.create(config);
