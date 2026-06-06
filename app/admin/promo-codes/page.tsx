import { ACTIVE_ADMIN_TYPES, type AdminType } from '@/lib/admin-types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { addLocalePrefix } from '@/lib/i18n/locale';
import { getRequestLocale } from '@/lib/i18n/server';
import PromoCodesClient from './PromoCodesClient';

export default async function AdminPromoCodesPage() {
  const locale = getRequestLocale();
  const supabase = createServerSupabaseClient();
  const localize = (href: string) => addLocalePrefix(href, locale);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `${localize('/auth/login')}?redirect=${encodeURIComponent(localize('/admin/promo-codes'))}`
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, admin_type')
    .eq('id', user.id)
    .maybeSingle();

  const adminType = (profile?.admin_type as AdminType | null) ?? null;
  const isAdmin = Boolean(adminType && ACTIVE_ADMIN_TYPES.includes(adminType));

  if (!isAdmin) {
    redirect(localize(profile?.role === 'admin' ? '/jobs' : '/dashboard'));
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Promo Codes</h1>
        <p className="text-gray-400">Manage discount codes for the platform</p>
      </div>
      <PromoCodesClient isSuperAdmin={adminType === 'super'} />
    </div>
  );
}
