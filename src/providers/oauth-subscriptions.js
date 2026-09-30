// SPDX-License-Identifier: GPL-3.0-or-later
// Noema uses its paired workspace. Standalone subscription login is unavailable.
function unavailable() {
  throw new Error('Use browser tasks in your Noema conversation.');
}
export async function startSubscriptionOAuth() { return unavailable(); }
export async function signOutSubscription() { return unavailable(); }
export async function getSubscriptionStatus() { return unavailable(); }
export async function refreshSubscription() { return unavailable(); }
export async function getSubscriptionAccessToken() { return unavailable(); }
