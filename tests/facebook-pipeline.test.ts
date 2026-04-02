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
}

function testFacebookLimitFromMaxPages() {
  assert.equal(facebookLimitFromMaxPages(undefined, 50), 50);
  assert.equal(facebookLimitFromMaxPages(1, 50), 25);
  assert.equal(facebookLimitFromMaxPages(20, 50), 200);
}

testWebhookNormalization();
testImageOnlyPostsAreExtractable();
testFacebookLimitFromMaxPages();

console.log('facebook pipeline test passed');
