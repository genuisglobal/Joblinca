'use client';

import { useEffect, useState } from 'react';

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  max_uses: number | null;
  current_uses: number;
  min_amount: number | null;
  max_discount: number | null;
  applicable_plan_slugs: string[] | null;
  starts_at: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface CreateForm {
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: string;
  max_uses: string;
  min_amount: string;
  max_discount: string;
  expires_at: string;
}

const initialForm: CreateForm = {
  code: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  max_uses: '',
  min_amount: '',
  max_discount: '',
  expires_at: '',
};

export default function PromoCodesClient({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(initialForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function fetchCodes() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/promo-codes');
      const data = await res.json();
      setCodes(data.promo_codes || []);
    } catch {
      // ignore
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchCodes();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCreating(true);

    try {
      const body: Record<string, unknown> = {
        code: form.code,
        description: form.description || null,
        discount_type: form.discount_type,
        discount_value: parseFloat(form.discount_value),
      };
      if (form.max_uses) body.max_uses = parseInt(form.max_uses, 10);
      if (form.min_amount) body.min_amount = parseFloat(form.min_amount);
      if (form.max_discount) body.max_discount = parseFloat(form.max_discount);
      if (form.expires_at) body.expires_at = new Date(form.expires_at).toISOString();

      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create');
        setCreating(false);
        return;
      }

      setForm(initialForm);
      setShowCreate(false);
      fetchCodes();
    } catch {
      setError('Failed to create promo code');
    }
    setCreating(false);
  }

  async function toggleActive(id: string, currentActive: boolean) {
    try {
      await fetch(`/api/admin/promo-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      fetchCodes();
    } catch {
      // ignore
    }
  }

  async function deleteCode(id: string) {
    if (!confirm('Deactivate this promo code?')) return;
    try {
      await fetch(`/api/admin/promo-codes/${id}`, { method: 'DELETE' });
      fetchCodes();
    } catch {
      // ignore
    }
  }

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setForm({ ...form, code: result });
  }

  return (
    <div>
      {/* Actions Bar */}
      {isSuperAdmin && (
        <div className="mb-6">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {showCreate ? 'Cancel' : 'Create Promo Code'}
          </button>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700"
        >
          <h3 className="text-lg font-semibold text-white mb-4">New Promo Code</h3>

          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. WELCOME20"
                  required
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none uppercase"
                />
                <button
                  type="button"
                  onClick={generateCode}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
                >
                  Generate
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Discount Type</label>
              <select
                value={form.discount_type}
                onChange={(e) =>
                  setForm({ ...form, discount_type: e.target.value as 'percentage' | 'fixed_amount' })
                }
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed_amount">Fixed Amount (CFA)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Discount Value {form.discount_type === 'percentage' ? '(%)' : '(CFA)'}
              </label>
              <input
                type="number"
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                placeholder={form.discount_type === 'percentage' ? '10' : '1000'}
                required
                min="1"
                max={form.discount_type === 'percentage' ? '100' : undefined}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Uses (optional)</label>
              <input
                type="number"
                value={form.max_uses}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                placeholder="Unlimited"
                min="1"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Discount Cap (optional, CFA)</label>
              <input
                type="number"
                value={form.max_discount}
                onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
                placeholder="No cap"
                min="0"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Min Amount (optional, CFA)</label>
              <input
                type="number"
                value={form.min_amount}
                onChange={(e) => setForm({ ...form, min_amount: e.target.value })}
                placeholder="No minimum"
                min="0"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Expires At (optional)</label>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {creating ? 'Creating...' : 'Create Code'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Codes Table */}
      {loading ? (
        <div className="text-gray-400">Loading promo codes...</div>
      ) : codes.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No promo codes yet.</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left text-xs text-gray-400 uppercase px-4 py-3">Code</th>
                  <th className="text-left text-xs text-gray-400 uppercase px-4 py-3">Discount</th>
                  <th className="text-left text-xs text-gray-400 uppercase px-4 py-3">Uses</th>
                  <th className="text-left text-xs text-gray-400 uppercase px-4 py-3">Dates</th>
                  <th className="text-left text-xs text-gray-400 uppercase px-4 py-3">Status</th>
                  <th className="text-left text-xs text-gray-400 uppercase px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {codes.map((code) => (
                  <tr key={code.id} className="hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <span className="font-mono font-medium text-white">{code.code}</span>
                      {code.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{code.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {code.discount_type === 'percentage'
                        ? `${code.discount_value}%`
                        : `${code.discount_value.toLocaleString()} CFA`}
                      {code.max_discount && (
                        <span className="text-xs text-gray-500 block">
                          max {code.max_discount.toLocaleString()} CFA
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">
                      {code.current_uses}
                      {code.max_uses ? ` / ${code.max_uses}` : ' / unlimited'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      <div>From: {new Date(code.starts_at).toLocaleDateString()}</div>
                      {code.expires_at && (
                        <div>Until: {new Date(code.expires_at).toLocaleDateString()}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          code.is_active
                            ? 'bg-green-900/30 text-green-400'
                            : 'bg-red-900/30 text-red-400'
                        }`}
                      >
                        {code.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleActive(code.id, code.is_active)}
                          className="text-xs text-gray-400 hover:text-white transition-colors"
                        >
                          {code.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {isSuperAdmin && (
                          <button
                            onClick={() => deleteCode(code.id)}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
