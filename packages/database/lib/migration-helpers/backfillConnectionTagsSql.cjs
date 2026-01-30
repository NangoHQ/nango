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
generated AS (
    SELECT
        id,
        existing_tags,
        (
            jsonb_strip_nulls(
                jsonb_build_object(
                    'end_user_id', end_user_id,
                    'end_user_email', email,
                    'end_user_display_name', display_name,
                    'organization_id', organization_id,
                    'organization_display_name', organization_display_name
                )
            )
            || COALESCE(
                (
                    SELECT jsonb_object_agg(key, value)
                    FROM jsonb_each_text(COALESCE(end_user_tags::jsonb, '{}'::jsonb))
                ),
                '{}'::jsonb
            )
        ) AS raw_tags
    FROM source
),
lowercased AS (
    SELECT
        id,
        existing_tags,
        COALESCE(
            (
                SELECT jsonb_object_agg(lower(key), value)
                FROM jsonb_each_text(raw_tags)
            ),
            '{}'::jsonb
        ) AS generated_tags
    FROM generated
),
merged AS (
    SELECT
        id,
        existing_tags,
        generated_tags,
        (generated_tags || existing_tags) AS merged_tags
    FROM lowercased
)
UPDATE _nango_connections AS c
SET tags = merged.merged_tags
FROM merged
WHERE c.id = merged.id
  AND merged.merged_tags IS DISTINCT FROM c.tags;`;
}

module.exports = {
    buildConnectionTagsBackfillUpdateSql
};
