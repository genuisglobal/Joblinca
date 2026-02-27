/**
 * Legacy webhook path kept for backwards-compatibility.
 *
 * The canonical webhook handler lives at /api/whatsapp/webhook.
 * Update your Meta Webhook URL to point there.
 * This file can be removed once Meta is pointed to the new path.
 */

export { GET, POST } from '@/app/api/whatsapp/webhook/route';
