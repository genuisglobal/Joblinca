import type { Metadata } from 'next';
import PrivacyPolicyContent from '@/app/privacy/PrivacyPolicyContent';

export const metadata: Metadata = {
  title: 'Privacy Policy | JobLinca',
  description: 'JobLinca Privacy Policy for website and WhatsApp services.',
};

export default function PrivacyPolicyPage() {
  return <PrivacyPolicyContent />;
}
