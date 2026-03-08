-- Backfill legacy package_type values based on name/slug semantics.
-- Safe and idempotent; can be run multiple times.

UPDATE hosting_packages
SET package_type = 'support'::packagetype,
    updated_at = NOW()
WHERE package_type = 'hosting'::packagetype
  AND (
    LOWER(name) LIKE '%support%'
    OR LOWER(slug) LIKE '%support%'
    OR LOWER(COALESCE(description, '')) LIKE '%support%'
  )
  AND (
    COALESCE(hosting_yearly_price, 0) = 0
    OR COALESCE(support_monthly_price, 0) > COALESCE(hosting_yearly_price, 0)
  );

UPDATE hosting_packages
SET package_type = 'hosting'::packagetype,
    updated_at = NOW()
WHERE package_type = 'support'::packagetype
  AND (
    LOWER(name) LIKE '%hosting%'
    OR LOWER(slug) LIKE '%hosting%'
    OR COALESCE(hosting_yearly_price, 0) > 0
  );
