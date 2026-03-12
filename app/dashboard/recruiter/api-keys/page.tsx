'use client';

import { useEffect, useState } from 'react';
import { Key, Plus, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_hour: number;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    const res = await fetch('/api/developer/keys');
    if (res.ok) {
      const data = await res.json();
      setKeys(data.keys);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!keyName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewKey(data.key);
        setKeyName('');
        setShowCreate(false);
        loadKeys();
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(keyId: string) {
    const res = await fetch('/api/developer/keys', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId }),
    });
    if (res.ok) loadKeys();
  }

  function handleCopyKey() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function formatDate(d: string | null) {
    if (!d) return 'Never';
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="text-sm text-gray-400 mt-1">
            Access Joblinca job data programmatically via the public API
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Key
        </button>
      </div>

      {/* New key alert */}
      {newKey && (
        <div className="mb-6 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-300 mb-2">
                Copy your API key now — it won&apos;t be shown again
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm text-green-400 font-mono break-all">
                  {newKey}
                </code>
                <button
                  onClick={handleCopyKey}
                  className="flex-shrink-0 rounded-lg bg-neutral-800 p-2 text-neutral-300 hover:text-white transition-colors"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <button
                onClick={() => setNewKey(null)}
                className="mt-3 text-xs text-yellow-400 hover:text-yellow-300"
              >
                I&apos;ve saved it — dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800 p-5">
          <h3 className="text-sm font-medium text-white mb-3">New API Key</h3>
          <div className="flex gap-2">
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="Key name (e.g., My Integration)"
              className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              maxLength={64}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !keyName.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active keys */}
      {activeKeys.length === 0 && !showCreate ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-12 text-center">
          <Key className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-1">No API keys yet</p>
          <p className="text-sm text-gray-500">
            Create a key to access job data via the <code className="text-blue-400">/api/v1/jobs</code> endpoint
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeKeys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800 p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium text-white">{k.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  <code className="text-gray-400">{k.key_prefix}......</code>
                  <span>Created {formatDate(k.created_at)}</span>
                  <span>Last used: {formatDate(k.last_used_at)}</span>
                  <span>{k.rate_limit_per_hour}/hr</span>
                </div>
              </div>
              <button
                onClick={() => handleRevoke(k.id)}
                className="flex-shrink-0 rounded-lg p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Revoke key"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-500 mb-3">
            Revoked Keys ({revokedKeys.length})
          </h3>
          <div className="space-y-2">
            {revokedKeys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900 p-3 opacity-60"
              >
                <div>
                  <span className="text-sm text-gray-400">{k.name}</span>
                  <span className="ml-2 text-xs text-gray-600">
                    <code>{k.key_prefix}......</code>
                  </span>
                </div>
                <span className="text-xs text-red-400/60">Revoked</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* API docs snippet */}
      <div className="mt-8 rounded-xl border border-gray-700 bg-gray-800 p-5">
        <h3 className="text-sm font-medium text-white mb-3">Quick Start</h3>
        <pre className="rounded-lg bg-neutral-900 p-4 text-sm text-gray-300 overflow-x-auto font-mono">
{`curl -H "Authorization: Bearer jbl_your_key_here" \\
  "https://joblinca.com/api/v1/jobs?q=developer&location=douala&limit=10"

# Response:
# { "data": [...], "pagination": { "total": 42, "limit": 10, "offset": 0 } }`}
        </pre>
        <div className="mt-3 text-xs text-gray-500">
          <p><strong>Params:</strong> q (search), location, remote (1/true), type, limit (max 100), offset</p>
          <p className="mt-1"><strong>Rate limit:</strong> {activeKeys[0]?.rate_limit_per_hour || 100} requests/hour per key</p>
        </div>
      </div>
    </div>
  );
}
