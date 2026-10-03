/**
 * Non-text messages for leads on the conversational agent.
 *
 *   voice note -> transcribed, then answered like a typed message
 *   PDF / Word -> saved as their CV, with the same rules as the website
 *   photo      -> polite pointer to send a PDF or type instead
 *
 * Leads not on the agent keep the old behaviour (media is ignored), which
 * the router enforces by only calling this for live leads.
 */

import type { WAInboundMessage } from '@/lib/whatsapp';
import type { WaLeadRow } from '@/lib/whatsapp-agent/leads';
import type { DownloadedMedia } from '@/lib/whatsapp-media';
import type { StoreResumeResult } from '@/lib/profile/store-resume';
import { RESUME_MAX_BYTES } from '@/lib/profile/store-resume';

/** ~5 minutes of WhatsApp Opus audio; longer notes are refused, not transcribed. */
export const VOICE_MAX_BYTES = 2 * 1024 * 1024;

export interface MediaDeps {
  download: (mediaId: string, maxBytes: number) => Promise<DownloadedMedia>;
  transcribe: (audio: ArrayBuffer, mimeType: string) => Promise<string>;
  storeResume: (params: {
    userId: string;
    role: string | null;
    buffer: ArrayBuffer;
    mimeType: string;
    filename: string | null;
  }) => Promise<StoreResumeResult>;
  recordTranscript: (waMessageId: string, text: string) => Promise<void>;
  registerUrl: (phone: string) => string;
  profileUrl: string;
}

export type MediaOutcome =
  /** Voice note understood: answer `text` as if they had typed it. */
  | { kind: 'transcript'; text: string }
  /** Fully handled: send `reply`. */
  | { kind: 'reply'; reply: string; event: string }
  /** Not ours (sticker, video, location...): leave to the old flow. */
  | { kind: 'ignore' };

export type InboundMediaKind = 'audio' | 'document' | 'image';

export function inboundMediaKind(message: WAInboundMessage): InboundMediaKind | null {
  if (message.type === 'audio' && message.audio?.id) return 'audio';
  if (message.type === 'document' && message.document?.id) return 'document';
  if (message.type === 'image' && message.image?.id) return 'image';
  return null;
}

function t(language: 'en' | 'fr' | null | undefined, en: string, fr: string): string {
  return language === 'fr' ? fr : en;
}

export async function handleInboundMedia(params: {
  message: WAInboundMessage;
  lead: WaLeadRow;
  role: string | null;
  deps: MediaDeps;
}): Promise<MediaOutcome> {
  const { message, lead, role, deps } = params;
  const lang = lead.language;
  const kind = inboundMediaKind(message);

  if (kind === 'audio') {
    try {
      const media = await deps.download(message.audio!.id, VOICE_MAX_BYTES);
      const text = (await deps.transcribe(media.buffer, media.mimeType)).trim();
      if (text.length < 2) {
        return {
          kind: 'reply',
          event: 'voice_empty',
          reply: t(lang, "Sorry, I couldn't make out that voice note. Could you say it again or type it?", "Désolé, je n'ai pas compris ce message vocal. Pouvez-vous le répéter ou l'écrire ?"),
        };
      }
      await deps.recordTranscript(message.id, `[voice] ${text}`);
      return { kind: 'transcript', text };
    } catch (error) {
      const tooLong = error instanceof Error && error.name === 'MediaTooLargeError';
      return {
        kind: 'reply',
        event: tooLong ? 'voice_too_long' : 'voice_failed',
        reply: tooLong
          ? t(lang, 'That voice note is a bit long for me. Could you send a shorter one, or type your question?', 'Ce message vocal est un peu long pour moi. Pouvez-vous en envoyer un plus court, ou écrire votre question ?')
          : t(lang, "Sorry, I couldn't listen to that voice note just now. Could you type it?", "Désolé, je n'ai pas pu écouter ce message vocal. Pouvez-vous l'écrire ?"),
      };
    }
  }

  if (kind === 'document') {
    const doc = message.document!;
    if (!lead.linked_user_id) {
      return {
        kind: 'reply',
        event: 'cv_no_account',
        reply: t(
          lang,
          `To save your CV, create a free account first, then send the file again:\n${deps.registerUrl(lead.phone_e164)}\nOr just tell me and I can set the account up here.`,
          `Pour enregistrer votre CV, créez d'abord un compte gratuit, puis renvoyez le fichier :\n${deps.registerUrl(lead.phone_e164)}\nOu dites-le-moi et je crée le compte ici.`
        ),
      };
    }
    if (role === 'recruiter' || role === 'admin' || role === 'staff') {
      return {
        kind: 'reply',
        event: 'document_from_recruiter',
        reply: t(lang, "I can't read files yet. To post a job, paste the job ad here as text.", "Je ne peux pas encore lire les fichiers. Pour publier une offre, collez le texte de l'annonce ici."),
      };
    }

    let media: DownloadedMedia;
    try {
      media = await deps.download(doc.id, RESUME_MAX_BYTES);
    } catch (error) {
      const tooLarge = error instanceof Error && error.name === 'MediaTooLargeError';
      return {
        kind: 'reply',
        event: tooLarge ? 'cv_too_large' : 'cv_download_failed',
        reply: tooLarge
          ? t(lang, 'That file is over 5 MB. Please send a smaller PDF or Word file.', 'Ce fichier dépasse 5 Mo. Envoyez un PDF ou un fichier Word plus léger.')
          : t(lang, "Sorry, I couldn't open that file. Please try sending it again.", "Désolé, je n'ai pas pu ouvrir ce fichier. Réessayez de l'envoyer."),
      };
    }

    const stored = await deps.storeResume({
      userId: lead.linked_user_id,
      role,
      buffer: media.buffer,
      mimeType: doc.mime_type || media.mimeType,
      filename: doc.filename || null,
    });

    switch (stored.status) {
      case 'stored':
        return {
          kind: 'reply',
          event: 'cv_stored',
          reply: t(
            lang,
            `✅ CV saved to your profile. Employers will see it when you apply.\nView or replace it here: ${deps.profileUrl}`,
            `✅ CV enregistré sur votre profil. Les employeurs le verront quand vous postulez.\nLe voir ou le remplacer : ${deps.profileUrl}`
          ),
        };
      case 'bad_type':
      case 'bad_content':
        return {
          kind: 'reply',
          event: `cv_${stored.status}`,
          reply: t(lang, 'Please send your CV as a PDF or Word file (.pdf, .doc, .docx).', 'Envoyez votre CV en PDF ou Word (.pdf, .doc, .docx).'),
        };
      case 'too_large':
        return { kind: 'reply', event: 'cv_too_large', reply: t(lang, 'That file is over 5 MB. Please send a smaller one.', 'Ce fichier dépasse 5 Mo. Envoyez-en un plus léger.') };
      case 'not_seeker':
        return { kind: 'reply', event: 'cv_not_seeker', reply: t(lang, 'CVs can only be added to job seeker accounts.', 'Les CV ne peuvent être ajoutés qu\'aux comptes candidats.') };
      default:
        return {
          kind: 'reply',
          event: 'cv_store_failed',
          reply: t(lang, `Sorry, I couldn't save your CV just now. You can upload it here: ${deps.profileUrl}`, `Désolé, je n'ai pas pu enregistrer votre CV. Vous pouvez le téléverser ici : ${deps.profileUrl}`),
        };
    }
  }

  if (kind === 'image') {
    return {
      kind: 'reply',
      event: 'image_unsupported',
      reply: t(
        lang,
        "I can't read photos yet. If it's your CV, send it as a PDF or Word file. Otherwise, just type your question.",
        'Je ne peux pas encore lire les photos. Si c\'est votre CV, envoyez-le en PDF ou Word. Sinon, écrivez simplement votre question.'
      ),
    };
  }

  return { kind: 'ignore' };
}
