export interface SharePointTokenResponse {
    token_type: 'Bearer';
    scope: string;
    expires_in: number;
    ext_expires_in: number;
    access_token: string;
    refresh_token: string;
}

export interface MicrosoftDecodedToken {
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
