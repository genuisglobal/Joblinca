/**
 * normalizeApifyFacebookPosts against the real apify/facebook-groups-scraper
 * item shape (Nov 2026). Shares have empty `text`; content is on sharedPost.
 */
import assert from 'node:assert/strict';

async function main() {
  const { normalizeApifyFacebookPosts } = await import('../lib/scrapers/facebook-pipeline');
  const photo = (id: string) => ({
    __typename: 'Photo',
    thumbnail: `https://scontent.xx.fbcdn.net/v/t39.99422-6/${id}_n.jpg?stp=1`,
    photo_image: { uri: `https://scontent.xx.fbcdn.net/v/t39.99422-6/${id}_n.jpg?stp=1`, height: 600, width: 500 },
    url: `https://www.facebook.com/photo/?fbid=${id}`,
    id,
    ocrText: 'May be an image of text',
  });
  const base = {
    facebookUrl: 'https://www.facebook.com/groups/374207869423832/',
    inputUrl: 'https://www.facebook.com/groups/374207869423832/',
    groupTitle: "offres d'emploi a douala",
    time: '2026-11-13T16:48:33.000Z',
    user: { id: '1', name: 'Poster' },
    likesCount: 0,
    commentsCount: 0,
  };
  const [plain, shared, imageOnly] = normalizeApifyFacebookPosts([
    { ...base, id: 'p1', url: 'https://www.facebook.com/groups/x/permalink/1/', text: 'Recrutement: comptable à Douala, CV à rh@example.cm' },
    {
      ...base,
      id: 'p2',
      url: 'https://www.facebook.com/groups/x/permalink/2/',
      text: '',
      sharedPost: { text: 'URGENT: la société X recrute 5 commerciaux à Yaoundé', media: [photo('901')] },
    },
    { ...base, id: 'p3', url: 'https://www.facebook.com/groups/x/permalink/3/', text: '', attachments: [photo('902')] },
  ]);

  assert.match(plain.text, /comptable/);
  assert.equal(plain.group_name, "offres d'emploi a douala");
  assert.equal(plain.group_url, 'https://www.facebook.com/groups/374207869423832/');
  assert.equal(plain.author, 'Poster');
  console.log('ok - plain post keeps text, group and author');

  assert.match(shared.text, /recrute 5 commerciaux/);
  assert.ok((shared.image_urls || []).length > 0, 'shared post images collected');
  console.log('ok - shared post: text and images taken from sharedPost');

  assert.equal(imageOnly.text, '');
  assert.ok((imageOnly.image_urls || []).length > 0, 'flyer images collected');
  console.log('ok - image-only flyer keeps its images for vision extraction');

  const flyer = {
    ...photo('903'),
    ocrText:
      "May be an image of text that says 'RECRUTEMENT URGENT Une société de Douala recrute 3 caissières. Dépôt CV: 677 00 00 00'",
  };
  const people = { ...photo('904'), ocrText: 'May be an image of 2 people and people smiling' };
  const [withFlyerText, noise] = normalizeApifyFacebookPosts([
    { ...base, id: 'p4', url: 'https://www.facebook.com/groups/x/permalink/4/', text: '', attachments: [flyer] },
    { ...base, id: 'p5', url: 'https://www.facebook.com/groups/x/permalink/5/', text: 'Bonjour à tous', attachments: [people] },
  ]);
  assert.match(withFlyerText.text, /^\[Text on image\] RECRUTEMENT URGENT .*caissières/);
  assert.equal(noise.text, 'Bonjour à tous');
  assert.equal(imageOnly.text, '', 'generic "May be an image of text" adds nothing');
  console.log('ok - flyer text Facebook read off the image is added; generic alt text is not');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
