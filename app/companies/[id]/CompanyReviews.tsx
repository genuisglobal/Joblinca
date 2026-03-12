'use client';

import { useEffect, useState } from 'react';
import { Star, Send } from 'lucide-react';

interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  isCurrentEmployee: boolean;
  createdAt: string;
  reviewer: { name: string | null; avatarUrl: string | null } | null;
}

interface Stats {
  count: number;
  average: number;
  distribution: number[];
}

export default function CompanyReviews({ companyId }: { companyId: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isCurrentEmployee, setIsCurrentEmployee] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/companies/${companyId}/reviews`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setReviews(data.reviews);
          setStats(data.stats);
        }
      })
      .catch(() => {});
  }, [companyId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, title, reviewBody: body, isCurrentEmployee }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to submit review');
        return;
      }
      // Refresh reviews
      setShowForm(false);
      setRating(0);
      setTitle('');
      setBody('');
      const refresh = await fetch(`/api/companies/${companyId}/reviews`).then((r) => r.json());
      setReviews(refresh.reviews);
      setStats(refresh.stats);
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  function StarDisplay({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
    const px = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`${px} ${s <= value ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-600'}`}
          />
        ))}
      </div>
    );
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <div>
      {/* Stats summary */}
      {stats && stats.count > 0 && (
        <div className="mb-6 flex items-center gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{stats.average}</div>
            <StarDisplay value={Math.round(stats.average)} />
            <div className="mt-1 text-xs text-neutral-500">
              {stats.count} {stats.count === 1 ? 'review' : 'reviews'}
            </div>
          </div>
          <div className="flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.distribution[star - 1];
              const pct = stats.count > 0 ? (count / stats.count) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-neutral-400">{star}</span>
                  <div className="h-2 flex-1 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-yellow-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-neutral-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Write review button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-6 flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-700 transition-colors"
        >
          <Star className="h-4 w-4" />
          Write a Review
        </button>
      )}

      {/* Review form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-neutral-700 bg-neutral-800/50 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setRating(s)}
                  onMouseEnter={() => setHoverRating(s)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-0.5"
                >
                  <Star
                    className={`h-7 w-7 transition-colors ${
                      s <= (hoverRating || rating)
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-neutral-600 hover:text-neutral-500'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="review-title" className="block text-sm font-medium text-neutral-300 mb-1">
              Title (optional)
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none"
              placeholder="Summarize your experience"
              maxLength={120}
            />
          </div>

          <div>
            <label htmlFor="review-body" className="block text-sm font-medium text-neutral-300 mb-1">
              Review
            </label>
            <textarea
              id="review-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none resize-none"
              placeholder="Share your experience working here..."
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-400 cursor-pointer">
            <input
              type="checkbox"
              checked={isCurrentEmployee}
              onChange={(e) => setIsCurrentEmployee(e.target.checked)}
              className="rounded border-neutral-600 bg-neutral-700"
            />
            I currently work here
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? 'Submitting...' : 'Submit Review'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-400 hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Reviews list */}
      {reviews.length === 0 && !showForm && (
        <p className="text-sm text-neutral-500">No reviews yet. Be the first to share your experience.</p>
      )}

      <div className="space-y-4">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <StarDisplay value={review.rating} />
                {review.title && (
                  <h4 className="mt-1 font-medium text-white text-sm">{review.title}</h4>
                )}
              </div>
              <span className="text-xs text-neutral-500">{formatDate(review.createdAt)}</span>
            </div>
            {review.body && (
              <p className="text-sm text-neutral-300 leading-relaxed">{review.body}</p>
            )}
            <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
              <span>{review.reviewer?.name || 'Anonymous'}</span>
              {review.isCurrentEmployee && (
                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-green-400">
                  Current Employee
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
