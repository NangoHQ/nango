import type { InternalNango as Nango } from '../../post-connection.js';
import type { OAuth2Credentials } from '@nangohq/types';
import jwt from 'jsonwebtoken';

interface MicrosoftDecodedToken {
    aud: string;
    iss: string;
    iat: number;
    nbf: number;
    exp: number;
    acct: number;
    acr: string;
    aio: string;
    amr: string[];
    app_displayname: string;
    appid: string;
    appidacr: string;
    family_name: string;
    given_name: string;
    idtyp: string;
    ipaddr: string;
    name: string;
    oid: string;
    platf: string;
    puid: string;
    rh: string;
    scp: string;
    signin_state: string[];
    sub: string;
    tenant_region_scope: string;
    tid: string;
    unique_name: string;
    upn: string;
    uti: string;
    ver: string;
    wids: string[];
    xms_ftd: string;
    xms_idrel: string;
    xms_st: {
        sub: string;
    };
    xms_tcdt: number;
}

export default async function execute(nango: Nango) {
    const connection = await nango.getConnection();
    const accessToken = (connection.credentials as OAuth2Credentials).access_token;
    const decoded = jwt.decode(accessToken) as MicrosoftDecodedToken;

    if (!decoded || typeof decoded !== 'object') {
        return;
    }

    const id = decoded.tid;

    await nango.updateConnectionConfig({ tenantId: id });
}
