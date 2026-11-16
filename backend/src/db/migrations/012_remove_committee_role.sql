UPDATE users
SET role = 'hr_specialist', updated_at = now()
WHERE role = 'committee';

CREATE TYPE user_role_without_committee AS ENUM ('admin', 'hr_specialist', 'area_manager');

ALTER TABLE users
  ALTER COLUMN role TYPE user_role_without_committee
  USING role::text::user_role_without_committee;

DROP TYPE user_role;

ALTER TYPE user_role_without_committee RENAME TO user_role;
