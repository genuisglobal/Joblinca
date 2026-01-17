import { checkAdminStatus, getAdminTypeLabel } from '@/lib/admin';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAdmin, adminType, userId, email } = await checkAdminStatus();

  if (!userId) {
    redirect('/auth/login?redirect=/admin');
  }

  if (!isAdmin) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Admin Sidebar */}
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Joblinca Admin</h2>
          <p className="text-xs text-gray-400 mt-1">
            {adminType && getAdminTypeLabel(adminType)}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavLink href="/admin" label="Dashboard" />
          <NavLink href="/admin/users" label="Users" />
          <NavLink href="/admin/jobs" label="Jobs" />
          <NavLink href="/admin/recruiters" label="Recruiters" />
          <NavLink href="/admin/applications" label="Applications" />
          <NavLink href="/admin/verifications" label="Verifications" />
          <NavLink href="/admin/payments" label="Payments" />

          {adminType === 'super' && (
            <>
              <div className="pt-4 mt-4 border-t border-gray-700">
                <p className="text-xs text-gray-500 uppercase mb-2">Super Admin</p>
              </div>
              <NavLink href="/admin/admins" label="Manage Admins" />
              <NavLink href="/admin/audit-log" label="Audit Log" />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 truncate">{email}</p>
          <Link
            href="/dashboard"
            className="text-xs text-blue-400 hover:text-blue-300 mt-1 block"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors"
    >
      {label}
    </Link>
  );
}
