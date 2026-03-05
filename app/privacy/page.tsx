import type { Metadata } from 'next';
import PrivacyPolicyContent from './PrivacyPolicyContent';

export const metadata: Metadata = {
  title: 'Privacy Policy | JobLinca',
  description: 'JobLinca Privacy Policy for website and WhatsApp services.',
};

export default function PrivacyPage() {
  return <PrivacyPolicyContent />;
}
