function bearer(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
  return match?.[1];
}

/** Build the authentication boundary from a token-to-identity map supplied by the host. */
export function createAuthenticator(raw = process.env.KNOWLEDGE_IDENTITIES ?? '{}') {
  let identities;
  try { identities = JSON.parse(raw); } catch { identities = {}; }
  return req => {
    const identity = identities[bearer(req)];
    if (!identity || typeof identity.subject !== 'string' || !Array.isArray(identity.groups)) return null;
    return identity;
  };
}
