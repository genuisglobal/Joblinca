import SponsorshipsClient from './SponsorshipsClient';

export default function AdminSponsorshipsPage() {
  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-white">Sponsorships</h1>
        <p className="text-gray-400">
          Manage sponsored jobs, employer spotlights, and academy placements.
        </p>
      </div>
      <SponsorshipsClient />
    </div>
  );
}
