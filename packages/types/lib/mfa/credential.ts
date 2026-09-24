export type MFACredential = { type: 'code'; code: string } | { type: 'recoveryCode'; recoveryCode: string };
