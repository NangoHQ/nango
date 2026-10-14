/** First observed website source. No user identity or full URLs. */
export interface SignupAcquisition {
    acquisition_utm_source?: string | undefined;
    acquisition_utm_medium?: string | undefined;
    acquisition_utm_campaign?: string | undefined;
    acquisition_utm_content?: string | undefined;
    acquisition_utm_term?: string | undefined;
    acquisition_referring_domain?: string | undefined;
    acquisition_landing_path?: string | undefined;
}
