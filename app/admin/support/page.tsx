import { requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { listSupportTicketsForAdmin } from '@/lib/support-tickets/service';
import SupportTicketsClient from './SupportTicketsClient';

export default async function AdminSupportPage() {
  await requireAdminType(['super', 'operations']);

  const serviceClient = createServiceSupabaseClient();
  const tickets = await listSupportTicketsForAdmin(serviceClient, {
    limit: 100,
  });

  const counts = {
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === 'open').length,
    active: tickets.filter((ticket) =>
      ['in_progress', 'waiting_on_user', 'escalated'].includes(ticket.status)
    ).length,
    resolved: tickets.filter((ticket) =>
      ['resolved', 'closed'].includes(ticket.status)
    ).length,
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Support Queue</h1>
        <p className="mt-1 text-gray-400">
          Review field escalations, move cases forward, and leave operational notes.
        </p>
      </div>

      <SupportTicketsClient tickets={tickets} counts={counts} />
    </div>
  );
}
