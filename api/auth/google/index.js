// api/auth/google/index.js - Initiate Google OAuth (from BizSimHub)
export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const host = req.headers.host;
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}/api/auth/google/callback`;
  const scope = encodeURIComponent('email profile');
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${scope}` +
    `&access_type=offline` +
    `&prompt=consent`;

  res.redirect(googleAuthUrl);
}
