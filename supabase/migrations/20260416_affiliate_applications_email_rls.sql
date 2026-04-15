-- Allow users to read any affiliate application whose email matches the email
-- on their auth session. This covers the case where an applicant's account was
-- recreated (e.g. after an email-confirmation flow) and the application's
-- user_id no longer matches auth.uid(), but the email still does. Without this
-- the dashboard would re-show them the blank application form.

DROP POLICY IF EXISTS "own_app_select" ON affiliate_applications;
CREATE POLICY "own_app_select" ON affiliate_applications
  FOR SELECT USING (
    auth.uid() = user_id
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
