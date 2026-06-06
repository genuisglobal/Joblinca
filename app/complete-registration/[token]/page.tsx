import CompleteRegistrationForm from './CompleteRegistrationForm';
import { getInviteClaimContext } from '@/lib/field-registration/service';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

function getRoleLabel(role: string): string {
  switch (role) {
    case 'job_seeker':
      return 'Job seeker';
    case 'talent':
      return 'Talent';
    case 'recruiter':
      return 'Recruiter';
    default:
      return 'Account';
  }
}

export default async function CompleteRegistrationPage({
  params,
}: {
  params: { token: string };
}) {
  const serviceClient = createServiceSupabaseClient();
  const inviteContext = await getInviteClaimContext(serviceClient, params.token).catch(
    () => null
  );

  if (!inviteContext) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          <h1 className="text-2xl font-semibold text-white">Registration link unavailable</h1>
          <p className="mt-3 text-sm text-neutral-400">
            This link is invalid, expired, or has already been used. Ask your JobLinca
            registration officer to send you a fresh link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
          <p className="text-sm uppercase tracking-[0.25em] text-blue-400">
            Complete registration
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Finish your JobLinca account
          </h1>
          <p className="mt-3 text-sm text-neutral-400">
            Your registration officer already saved your basic details. Add your email and
            password to activate your account.
          </p>

          <div className="mt-6 grid gap-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Role</p>
              <p className="mt-2 text-sm font-medium text-white">
                {getRoleLabel(inviteContext.lead.intended_role)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Captured name</p>
              <p className="mt-2 text-sm font-medium text-white">
                {inviteContext.lead.full_name}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">WhatsApp number</p>
              <p className="mt-2 text-sm font-medium text-white">
                {inviteContext.lead.phone_e164}
              </p>
            </div>
          </div>
        </div>

        <CompleteRegistrationForm
          token={params.token}
          fullName={inviteContext.lead.full_name}
          phone={inviteContext.lead.phone_e164}
          intendedRole={inviteContext.lead.intended_role}
          email={inviteContext.lead.email || ''}
        />
      </div>
    </main>
  );
}
