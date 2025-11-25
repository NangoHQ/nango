export interface SellsyDecodedToken {
    aud: string;
    jti: string;
    iat: number;
    nbf: number;
    exp: number;
    sub: string;
    scopes: string[];
    userType: string;
    userId: number;
    corpId: number;
    corpName: string;
    firstName: string;
    lastName: string;
    language: string;
    email: string;
}
