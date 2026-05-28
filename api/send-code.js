// Vercel serverless function: start an SMS verification via Telnyx Verify.
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.TELNYX_API_KEY;
  const verifyProfileId = process.env.TELNYX_VERIFY_PROFILE_ID;
  if (!apiKey || !verifyProfileId) {
    return res.status(500).json({ error: 'Server is missing Telnyx configuration' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const phone = normalizeAU(body.phone || body.mobile);
  if (!phone) {
    return res.status(400).json({ error: 'A valid Australian mobile number is required' });
  }

  try {
    const telnyxRes = await fetch('https://api.telnyx.com/v2/verifications/sms', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone_number: phone,
        verify_profile_id: verifyProfileId
      })
    });

    if (!telnyxRes.ok) {
      let detail;
      try { detail = await telnyxRes.json(); } catch { detail = await telnyxRes.text(); }
      console.error('Telnyx send-code failed:', telnyxRes.status, detail);
      return res.status(502).json({ error: 'Failed to send verification code' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('send-code error:', err);
    return res.status(500).json({ error: 'Unexpected error sending verification code' });
  }
}
