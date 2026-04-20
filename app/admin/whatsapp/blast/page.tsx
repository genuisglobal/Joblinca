import BlastClient from './BlastClient';

export const dynamic = 'force-dynamic';

export default function WhatsappBlastPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">WhatsApp Blast</h1>
        <p className="text-sm text-gray-400 mt-1">
          Send a WhatsApp message to all job seekers, or narrow the audience by
          keywords, qualifications, and locations. Preview the recipient list
          before sending.
        </p>
      </div>
      <BlastClient />
    </div>
  );
}
