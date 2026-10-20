/** Optional ad matching context on the existing new-account event. Never a group property. */
export interface SignupAdvertising {
    is_advertising_allowed: true;
    is_advertising_gpc: false;
    advertising_consent_method: 'explicit' | 'implied';
    advertising_consent_timestamp: string;
    advertising_oppref_click_timestamp?: string;
    advertising_fbc?: string;
    advertising_oppref?: string;
}
