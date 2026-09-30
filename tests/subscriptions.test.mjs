// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as subscriptions from '../src/providers/oauth-subscriptions.js';

test('standalone subscription entry points reject without browser or network access', async () => {
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { requests++; throw Error('Unexpected request'); };
  try {
    assert.deepEqual(Object.keys(subscriptions).sort(), [
      'getSubscriptionAccessToken', 'getSubscriptionStatus', 'refreshSubscription',
      'signOutSubscription', 'startSubscriptionOAuth',
    ]);
    for (const method of Object.values(subscriptions)) {
      await assert.rejects(method('unsupported'), /Use browser tasks in your Noema conversation/);
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
