function buildConnectionTagsBackfillUpdateSql() {
    return `
WITH source AS (
    SELECT
        c.id,
        COALESCE(c.tags, '{}'::jsonb) AS existing_tags,
        eu.end_user_id,
        eu.email,
        eu.display_name,
        eu.organization_id,
        eu.organization_display_name,
        eu.tags AS end_user_tags
    FROM _nango_connections AS c
    INNER JOIN end_users AS eu
        ON eu.id = c.end_user_id
),
base AS (
    SELECT
        id,
        existing_tags,
        jsonb_strip_nulls(
            jsonb_build_object(
                'end_user_id', NULLIF(left(end_user_id::text, 255), ''),
                'end_user_email', NULLIF(left(email::text, 255), ''),
                'end_user_display_name', NULLIF(left(display_name::text, 255), ''),
                'organization_id', NULLIF(left(organization_id::text, 255), ''),
                'organization_display_name', NULLIF(left(organization_display_name::text, 255), '')
            )
        ) AS base_tags,
        COALESCE(end_user_tags::jsonb, '{}'::jsonb) AS end_user_tags_object
    FROM source
 ),
end_user_tag_entries AS (
    SELECT
        b.id,
        kv.key AS raw_key,
        kv.value AS raw_value,
        left(lower(kv.key), 64) AS normalized_key,
        NULLIF(left(kv.value, 255), '') AS normalized_value,
        (length(kv.key) > 64) AS key_too_long,
        (length(kv.value) > 255) AS value_too_long,
        (left(lower(kv.key), 64) ~ '^[a-z][a-z0-9_./-]*$') AS key_valid,
        (NULLIF(left(kv.value, 255), '') IS NOT NULL) AS value_valid
    FROM base AS b
    CROSS JOIN LATERAL jsonb_each_text(b.end_user_tags_object) AS kv(key, value)
 ),
sanitized_end_user_tags AS (
    SELECT
        b.id,
        b.existing_tags,
        b.base_tags,
        COALESCE(
            jsonb_object_agg(e.normalized_key, e.normalized_value) FILTER (WHERE e.key_valid AND e.value_valid),
            '{}'::jsonb
        ) AS end_user_tags_sanitized
    FROM base
        AS b
    LEFT JOIN end_user_tag_entries AS e
        ON e.id = b.id
    GROUP BY
        b.id,
        b.existing_tags,
        b.base_tags
 ),
bounded AS (
    SELECT
        s.id,
        s.existing_tags,
        s.base_tags,
        s.end_user_tags_sanitized,
        s.candidate_key_count,
        CASE
            WHEN s.candidate_key_count > 10 THEN true
            ELSE false
        END AS dropped_end_user_tags_due_to_max_count,
        CASE
            WHEN s.candidate_key_count > 10 THEN s.base_tags
            ELSE (s.base_tags || s.end_user_tags_sanitized)
        END AS generated_tags
    FROM (
        SELECT
            id,
            existing_tags,
            base_tags,
            end_user_tags_sanitized,
            (SELECT COUNT(*) FROM jsonb_object_keys(base_tags || end_user_tags_sanitized)) AS candidate_key_count
        FROM sanitized_end_user_tags
    ) AS s
 ),
merged AS (
    SELECT
        id,
        dropped_end_user_tags_due_to_max_count,
        (generated_tags || existing_tags) AS merged_tags
    FROM bounded
 ),
updated AS (
    UPDATE _nango_connections AS c
    SET tags = merged.merged_tags
    FROM merged
    WHERE c.id = merged.id
      AND merged.merged_tags IS DISTINCT FROM c.tags
    RETURNING c.id
 )
 SELECT
     200 AS offending_keys_cap,
     (SELECT COUNT(*) FROM updated) AS updated_rows,
     (SELECT COUNT(*) FROM source) AS scanned_rows,
     (SELECT COUNT(*) FROM merged WHERE dropped_end_user_tags_due_to_max_count) AS dropped_end_user_tags_due_to_max_count_connections,

     (SELECT COUNT(*) FROM end_user_tag_entries WHERE key_too_long) AS truncated_key_entries,
     (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM (
         SELECT DISTINCT raw_key AS key
         FROM end_user_tag_entries
         WHERE key_too_long
         ORDER BY raw_key
         LIMIT 200
     ) AS t) AS truncated_key_keys,

     (SELECT COUNT(*) FROM end_user_tag_entries WHERE value_too_long) AS truncated_value_entries,
     (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM (
         SELECT DISTINCT raw_key AS key
         FROM end_user_tag_entries
         WHERE value_too_long
         ORDER BY raw_key
         LIMIT 200
     ) AS t) AS truncated_value_keys,

     (SELECT COUNT(*) FROM end_user_tag_entries WHERE NOT key_valid) AS invalid_key_format_entries,
     (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM (
         SELECT DISTINCT raw_key AS key
         FROM end_user_tag_entries
         WHERE NOT key_valid
         ORDER BY raw_key
         LIMIT 200
     ) AS t) AS invalid_key_format_keys,

     (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb) FROM (
         SELECT DISTINCT e.raw_key AS key
         FROM end_user_tag_entries AS e
         INNER JOIN merged AS m
             ON m.id = e.id
         WHERE m.dropped_end_user_tags_due_to_max_count
         ORDER BY e.raw_key
         LIMIT 200
     ) AS t) AS dropped_end_user_tags_due_to_max_count_keys
 ;`;
}

module.exports = {
    buildConnectionTagsBackfillUpdateSql
};
