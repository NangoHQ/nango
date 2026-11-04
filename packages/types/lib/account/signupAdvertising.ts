/** Optional ad matching context on the existing new-account event. Never a group property. */
export interface SignupAdvertising {
    advertising_consent_method: 'explicit' | 'implied';
    advertising_consent_timestamp: string;
    advertising_oppref_click_timestamp?: string;
    advertising_fbc?: string;
    advertising_oppref?: string;
}
