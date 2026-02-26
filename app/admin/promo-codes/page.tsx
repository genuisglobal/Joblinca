import { checkAdminStatus } from '@/lib/admin';
import { redirect } from 'next/navigation';
import PromoCodesClient from './PromoCodesClient';

export default async function AdminPromoCodesPage() {
  const { isAdmin, adminType, userId } = await checkAdminStatus();

  if (!userId) {
    redirect('/auth/login?redirect=/admin/promo-codes');
  }
  if (!isAdmin) {
    redirect('/dashboard');
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
