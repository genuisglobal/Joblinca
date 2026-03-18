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
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col fixed h-full">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Joblinca Admin</h2>
          <p className="text-xs text-gray-400 mt-1">
            {adminType && getAdminTypeLabel(adminType)}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLink href="/admin" icon={<DashboardIcon />} label="Dashboard" />
          <NavLink href="/admin/jobs/new" icon={<PlusIcon />} label="Post Job" />

          <div className="pt-4 mt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 uppercase mb-2 px-3">Management</p>
          </div>
          <NavLink href="/admin/jobs" icon={<BriefcaseIcon />} label="Jobs" />
          <NavLink href="/admin/verifications" icon={<ShieldCheckIcon />} label="Verifications" />
          <NavLink href="/admin/reports" icon={<FlagIcon />} label="Reports" />
          <NavLink href="/admin/users" icon={<UsersIcon />} label="Users" />
          <NavLink href="/admin/field-agents" icon={<UsersIcon />} label="Field Agents" />
          <NavLink href="/admin/recruiters" icon={<BuildingIcon />} label="Recruiters" />
          <NavLink href="/admin/applications" icon={<DocumentIcon />} label="Applications" />

          <div className="pt-4 mt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 uppercase mb-2 px-3">Aggregation</p>
          </div>
          <NavLink href="/admin/aggregation" icon={<LayersIcon />} label="Control Room" />
          <NavLink href="/admin/aggregation/sources" icon={<GlobeIcon />} label="Sources" />
          <NavLink href="/admin/aggregation/discovered-jobs" icon={<CompassIcon />} label="Discovered Jobs" />
          <NavLink href="/admin/aggregation/runs" icon={<ClockIcon />} label="Runs" />

          <div className="pt-4 mt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 uppercase mb-2 px-3">Finance</p>
          </div>
          <NavLink href="/admin/payments" icon={<CreditCardIcon />} label="Payments" />
          <NavLink href="/admin/promo-codes" icon={<TagIcon />} label="Promo Codes" />
          <NavLink href="/admin/sponsorships" icon={<MegaphoneIcon />} label="Sponsorships" />

          {adminType === 'super' && (
            <>
              <div className="pt-4 mt-4 border-t border-gray-700">
                <p className="text-xs text-gray-500 uppercase mb-2 px-3">Super Admin</p>
              </div>
              <NavLink href="/admin/admins" icon={<KeyIcon />} label="Manage Admins" />
              <NavLink href="/admin/audit-log" icon={<ClipboardIcon />} label="Audit Log" />
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
      <main className="flex-1 ml-64 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded-md transition-colors"
    >
      {icon && <span className="w-5 h-5 text-gray-400">{icon}</span>}
      {label}
    </Link>
  );
}

// Icon components
function DashboardIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function MegaphoneIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5.882A1 1 0 0112.447 5L20 9v6l-7.553 4A1 1 0 0111 18.118V5.882zM5 10h6v4H5a2 2 0 110-4zm1 4l1.5 4"
      />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4l8 4-8 4-8-4 8-4zm0 8l8 4-8 4-8-4 8-4zm0 8l8-4" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-9c2.5 2.5 4 5.833 4 9s-1.5 6.5-4 9m0-18c-2.5 2.5-4 5.833-4 9s1.5 6.5 4 9m-8-9h16" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9 9 0 100-18 9 9 0 000 18zm3-12l-4 2-2 4 4-2 2-4z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
