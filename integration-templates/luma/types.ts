interface GeoAddress {
    city: string;
    type: string;
    region: string;
    address: string;
    country: string;
    latitude: string;
    place_id: string;
    longitude: string;
    city_state: string;
    description: string;
    full_address: string;
}

interface Event {
    api_id: string;
    created_at: string;
    cover_url: string;
    name: string;
    description: string;
    description_md: string;
    series_api_id: string | null;
    start_at: string;
    duration_interval: string;
    end_at: string;
    geo_address_json: GeoAddress | null;
    geo_latitude: string | null;
    geo_longitude: string | null;
    url: string;
    timezone: string;
    event_type: string;
    user_api_id: string;
    visibility: string;
    meeting_url: string | null;
    zoom_meeting_url: string | null;
}

interface Tag {
    api_id: string;
    name: string;
}

export interface LumaEvent {
    api_id: string;
    event: Event;
    tags: Tag[];
}
