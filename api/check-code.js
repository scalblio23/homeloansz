// Vercel serverless function: verify an SMS code via Telnyx Verify.
// Credentials are read only from environment variables, never hardcoded.

function normalizeAU(input) {
  if (input === undefined || input === null) return null;
  let digits = String(input).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');

  if (digits.startsWith('61')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Australian mobile numbers are 9 digits and start with 4 once the
  // country/trunk prefix is stripped (e.g. 0412 345 678 -> 412345678).
  if (!/^4\d{8}$/.test(digits)) return null;
  return '+61' + digits;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ verified: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.TELNYX_API_KEY;
  const verifyProfileId = process.env.TELNYX_VERIFY_PROFILE_ID;
  if (!apiKey || !verifyProfileId) {
    return res.status(500).json({ verified: false, error: 'Server is missing Telnyx configuration' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const phone = normalizeAU(body.phone || body.mobile);
  if (!phone) {
    return res.status(400).json({ verified: false, error: 'A valid Australian mobile number is required' });
  }

  const code = body.code === undefined || body.code === null ? '' : String(body.code).trim();
  if (!/^\d{4,10}$/.test(code)) {
    return res.status(400).json({ verified: false, error: 'A valid verification code is required' });
  }

  try {
    const url = `https://api.telnyx.com/v2/verifications/by_phone_number/${encodeURIComponent(phone)}/actions/verify`;
    const telnyxRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        verify_profile_id: verifyProfileId
      })
    });

    let data = null;
    try { data = await telnyxRes.json(); } catch { data = null; }

    if (telnyxRes.ok && data && data.data && data.data.response_code === 'accepted') {
      return res.status(200).json({ verified: true });
    }

    return res.status(200).json({ verified: false, error: 'Invalid or expired verification code' });
  } catch (err) {
    console.error('check-code error:', err);
    return res.status(500).json({ verified: false, error: 'Unexpected error verifying code' });
  }
}
