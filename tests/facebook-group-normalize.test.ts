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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
