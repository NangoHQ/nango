import type { LumaEvent } from '../types';
import type { Event } from '../../models';
/**
 * Converts a LumaEvent object to a slim Event object.
 * Only includes essential properties mapped from LumaEvent.
 * @param event The LumaEvent to be converted.
 * @returns The corresponding slim Event object.
 */
export function toEvent(event: LumaEvent): Event {
    const formattedEvent: Event = {
        id: event.event.api_id,
        created_at: new Date(event.event.created_at).toISOString(),
        cover_url: event.event.cover_url,
        name: event.event.name,
        description: event.event.description,
        description_md: event.event.description_md,
        series_api_id: event.event.series_api_id,
        start_at: new Date(event.event.start_at).toISOString(),
        duration_interval: event.event.duration_interval,
        end_at: new Date(event.event.end_at).toISOString(),
        geo_latitude: event.event.geo_latitude,
        geo_longitude: event.event.geo_longitude,
        geo_address_json: event.event.geo_address_json
            ? {
                  city: event.event.geo_address_json.city,
                  type: event.event.geo_address_json.type,
                  region: event.event.geo_address_json.region,
                  address: event.event.geo_address_json.address,
                  country: event.event.geo_address_json.country,
                  latitude: event.event.geo_address_json.latitude,
                  place_id: event.event.geo_address_json.place_id,
                  longitude: event.event.geo_address_json.longitude,
                  city_state: event.event.geo_address_json.city_state,
                  description: event.event.geo_address_json.description,
                  full_address: event.event.geo_address_json.full_address
              }
            : null,
        url: event.event.url,
        timezone: event.event.timezone,
        event_type: event.event.event_type,
        user_api_id: event.event.user_api_id,
        visibility: event.event.visibility,
        meeting_url: event.event.meeting_url,
        zoom_meeting_url: event.event.zoom_meeting_url
    };

    return formattedEvent;
}
