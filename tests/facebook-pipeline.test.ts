import assert from 'node:assert/strict';

import { facebookLimitFromMaxPages, normalizeApifyFacebookPosts } from '@/lib/scrapers/facebook-pipeline';
import { isFacebookPostExtractable } from '@/lib/scrapers/providers/facebook';

function testWebhookNormalization() {
  const posts = normalizeApifyFacebookPosts([
    {
      postId: 'post-1',
      postText: 'Recrutement urgent',
      postUrl: 'https://facebook.com/groups/example/posts/1',
      groupName: 'Job Group',
      groupUrl: 'https://facebook.com/groups/example',
      imageUrls: ['https://cdn.example.com/flyer.png'],
    },
  ]);

  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, 'post-1');
  assert.equal(posts[0].group_name, 'Job Group');
  assert.equal(posts[0].image_urls?.length, 1);
}

function testImageOnlyPostsAreExtractable() {
  assert.equal(
    isFacebookPostExtractable({
      id: 'img-only',
      text: '',
      image_urls: ['https://cdn.example.com/flyer.png'],
    }),
    true
  );

  assert.equal(
    isFacebookPostExtractable({
      id: 'too-short',
      text: 'Hi',
      image_urls: [],
    }),
    false
  );

  assert.equal(
    isFacebookPostExtractable({
      id: 'short-joby',
      text: 'Recrutement urgent',
      image_urls: [],
    }),
    true
  );
}

function testFacebookLimitFromMaxPages() {
  assert.equal(facebookLimitFromMaxPages(undefined, 50), 50);
  assert.equal(facebookLimitFromMaxPages(1, 50), 25);
  assert.equal(facebookLimitFromMaxPages(20, 50), 200);
}

function testNestedWebhookNormalization() {
  const posts = normalizeApifyFacebookPosts([
    {
      post: {
        id: 'nested-1',
        message: 'Offre d’emploi - chauffeur',
        permalink: 'https://www.facebook.com/groups/example/posts/12345',
        created_time: '2026-05-10T12:00:00Z',
      },
      group: {
        name: 'Jobs Cameroon',
        id: '987654321',
      },
      author: {
        name: 'Recruiter Jane',
      },
      attachments: [
        {
          media: {
            image: {
              url: 'https://cdn.example.com/flyer.jpg',
            },
          },
        },
      ],
      stats: {
        likes: 8,
        comments: 2,
        shares: 1,
      },
    },
  ]);

  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, 'nested-1');
  assert.equal(posts[0].group_name, 'Jobs Cameroon');
  assert.equal(posts[0].group_url, 'https://www.facebook.com/groups/987654321/');
  assert.equal(posts[0].author, 'Recruiter Jane');
  assert.equal(posts[0].likes, 8);
  assert.equal(posts[0].image_urls?.[0], 'https://cdn.example.com/flyer.jpg');
}

testWebhookNormalization();
testImageOnlyPostsAreExtractable();
testFacebookLimitFromMaxPages();
testNestedWebhookNormalization();

console.log('facebook pipeline test passed');
