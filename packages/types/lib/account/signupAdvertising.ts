/** Optional ad matching context on the existing new-account event. Never a group property. */
export interface SignupAdvertising {
    advertising_consent_method: 'explicit' | 'implied';
    advertising_consent_timestamp: string;
    advertising_oppref_click_timestamp?: string;
    advertising_fbc?: string;
    advertising_oppref?: string;
    /** Server-derived signup creator classification, not the current company membership. Google only. */
    is_signup_creator_internal?: boolean;
    advertising_google_click_type?: 'gclid' | 'gbraid' | 'wbraid';
    advertising_google_click_id?: string;
    advertising_google_click_timestamp?: string;
    advertising_google_ad_user_data?: 'granted';
    advertising_google_ad_personalization?: 'granted';
}
