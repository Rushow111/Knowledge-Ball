import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticator } from './auth.mjs';

test('authenticator accepts bearer identities without exposing tokens to the domain', () => {
  const authenticate = createAuthenticator(JSON.stringify({ secret: { subject: 'user-1', groups: ['team-a'] } }));
  assert.deepEqual(authenticate({ headers: { authorization: 'Bearer secret' } }), { subject: 'user-1', groups: ['team-a'] });
  assert.equal(authenticate({ headers: { authorization: 'Bearer wrong' } }), null);
  assert.equal(authenticate({ headers: {} }), null);
});
