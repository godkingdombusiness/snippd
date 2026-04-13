import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── OCR mode: strict receipt extraction ───────────────────────────────────────
const OCR_SYSTEM_PROMPT = `Strict Extraction Mode.

You are a grocery receipt OCR parser. Your ONLY job is to extract the exact line items printed on the physical receipt provided.

Rules:
- Return ONLY items that are explicitly printed on the receipt image. Do not infer, hallucinate, or suggest related items.
- Do not add items that are commonly bought together with what you see.
- Do not autocomplete partial item names beyond what is legible on the receipt.
- If an item name is abbreviated (e.g. "DOLE BAN 3LB"), transcribe it as-is; do not expand it.
- Ignore store headers, footers, tax lines, subtotals, totals, payment method lines, cashier names, and loyalty program text.
- If you cannot read a line clearly, omit it entirely rather than guessing.

Output format — return a JSON object with a single key "items", which is an array of objects:
{
  "items": [
    { "name": "<exact item name from receipt>", "price": <price as a number>, "quantity": <quantity as a number or 1 if not shown> }
  ]
}

Do not include any explanation, markdown, or text outside the JSON object.`;

// ── Recipe/text mode: Chef Stash ──────────────────────────────────────────────
const RECIPE_SYSTEM_PROMPT = `You are Chef Stash, a friendly, encouraging home cooking assistant.
Always respond with valid JSON only — no markdown fences, no extra text outside the JSON object.
Keep recipes practical, budget-friendly, and positive.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { imageBase64, mimeType = 'image/jpeg', contents } = body;

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Determine mode ────────────────────────────────────────────────────────
    let requestBody: object;
    let isTextMode = false;

    if (imageBase64) {
      // OCR mode — strict receipt extraction
      requestBody = {
        system_instruction: { parts: [{ text: OCR_SYSTEM_PROMPT }] },
        contents: [
          {
            parts: [
              { text: 'Extract all purchased items from this grocery receipt.' },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          topP: 1,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      };
    } else if (contents) {
      // Text/recipe mode — Chef Stash
      isTextMode = true;
      requestBody = {
        system_instruction: { parts: [{ text: RECIPE_SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      };
    } else {
      return new Response(JSON.stringify({ error: 'Provide either imageBase64 (OCR) or contents (text generation)' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: 'Gemini API error', detail: errText }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    if (isTextMode) {
      // For text mode, return the raw candidates response so ChefStash can parse it
      return new Response(JSON.stringify(geminiData), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // OCR mode — parse and return items array
    let parsed: { items?: unknown[] };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse Gemini response', raw: rawText }), {
        status: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal error', detail: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
