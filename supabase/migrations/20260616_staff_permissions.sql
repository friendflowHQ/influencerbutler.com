-- Assistant accounts and granular admin permissions.
--
-- Super-admins remain env-based (ADMIN_EMAILS) and implicitly hold every
-- permission. Assistants are Supabase users with a staff_members row granting a
-- chosen set of permission scopes, resolved per-request and checked against the
-- action being performed (see src/lib/admin.ts resolveActor / requirePermission
-- and src/lib/permissions.ts for the scope catalog).
--
-- Both tables are service-role only (deny-all RLS), following the pattern in
-- 20260528_affiliate_clicks.sql. All access goes through admin-gated API routes
-- using createAdminClient().

CREATE TABLE IF NOT EXISTS staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'assistant' CHECK (role IN ('admin', 'assistant')),
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  label TEXT,
  created_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_members_user_id_idx ON staff_members (user_id);
CREATE INDEX IF NOT EXISTS staff_members_active_idx ON staff_members (user_id) WHERE is_active = true;

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_members_no_anon" ON staff_members;
CREATE POLICY "staff_members_no_anon" ON staff_members
  FOR ALL USING (false) WITH CHECK (false);

-- Append-only audit trail for every admin/assistant mutation. Critical for
-- accountability once multiple assistants can act.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx ON admin_audit_log (actor_user_id);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_audit_log_no_anon" ON admin_audit_log;
CREATE POLICY "admin_audit_log_no_anon" ON admin_audit_log
  FOR ALL USING (false) WITH CHECK (false);
