-- Let a recruiter delete their own recruiters row.
--
-- 20260102000700_fix_initial_policies is the authoritative policy set for this
-- table: it grants a recruiter select/insert/update on their own row and gives
-- admins FOR ALL. DELETE was never granted to recruiters, so removing your own
-- recruiter record required an admin. This closes that gap.
--
-- The earlier "Own recruiter modify" policy in 20260102000100_initial is not
-- the place to do this -- both 20260102000200 and 20260102000700 drop it, so
-- anything added there is discarded during a replay.
--
-- Scope note: this grants DELETE on public.recruiters only. Rows in other
-- tables that reference a recruiter are governed by that table's own policies
-- and by the FK actions declared on them; this migration does not widen either.

drop policy if exists "Recruiter delete self" on public.recruiters;

create policy "Recruiter delete self"
on public.recruiters
for delete
to authenticated
using (auth.uid() = id);
