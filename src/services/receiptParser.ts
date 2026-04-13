/**
 * receiptParser — Receipt OCR and parsing service
 *
 * parseReceipt():
 *  1. Fetches receipt image from Supabase storage
 *  2. Sends to GPT-4V or Gemini Vision API for OCR
 *  3. Extracts store name, date, line items with prices
 *  4. Normalizes product names and matches to product_catalog
 *  5. Returns ParsedReceipt with items array and totals
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ParsedReceipt, ParsedReceiptItem } from '../types/events';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Use Gemini by default, fallback to GPT-4V
const VISION_API = process.env.VISION_API || 'gemini';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface VisionAPIResponse {
  store_name?: string;
  date?: string;
  items: Array<{
    product_name: string;
    qty: number;
    unit_price: number;
    line_total: number;
    promo_savings?: number;
  }>;
  subtotal?: number;
  tax?: number;
  total: number;
}

// ─────────────────────────────────────────────────────────────
// Main function
// ─────────────────────────────────────────────────────────────

export async function parseReceipt(
  imageUrl: string,
  retailerKey: string,
  supabase: SupabaseClient
): Promise<ParsedReceipt> {
  // 1. Fetch image from Supabase storage
  const { data: imageData, error: fetchError } = await supabase.storage
    .from('receipts')
    .download(imageUrl);

  if (fetchError) {
    throw new Error(`Failed to fetch receipt image: ${fetchError.message}`);
  }

  // Convert blob to base64
  const base64Image = await blobToBase64(imageData);

  // 2. Send to vision API for OCR
  const visionResponse = await callVisionAPI(base64Image, retailerKey);

  // 3. Parse and normalize the response
  const parsedItems: ParsedReceiptItem[] = visionResponse.items.map(item => {
    const normalizedKey = item.product_name.toLowerCase().trim();

    return {
      product_name: item.product_name,
      qty: item.qty,
      unit_price: Math.round(item.unit_price * 100), // Convert to cents
      line_total: Math.round(item.line_total * 100),
      promo_savings_cents: item.promo_savings ? Math.round(item.promo_savings * 100) : 0,
      normalized_key: normalizedKey,
      // TODO: Add category/brand matching against product_catalog
    };
  });

  // Calculate totals if not provided
  const subtotalCents = visionResponse.subtotal
    ? Math.round(visionResponse.subtotal * 100)
    : parsedItems.reduce((sum, item) => sum + item.line_total, 0);

  const taxCents = visionResponse.tax
    ? Math.round(visionResponse.tax * 100)
    : Math.round(subtotalCents * 0.08); // Estimate 8% tax

  const totalCents = visionResponse.total
    ? Math.round(visionResponse.total * 100)
    : subtotalCents + taxCents;

  return {
    store_name: visionResponse.store_name || 'Unknown Store',
    date: visionResponse.date || new Date().toISOString().split('T')[0],
    items: parsedItems,
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    total_cents: totalCents,
  };
}

// ─────────────────────────────────────────────────────────────
// Vision API calls
// ─────────────────────────────────────────────────────────────

async function callVisionAPI(base64Image: string, retailerKey: string): Promise<VisionAPIResponse> {
  if (VISION_API === 'gemini') {
    return await callGeminiVision(base64Image, retailerKey);
  } else {
    return await callGPT4Vision(base64Image, retailerKey);
  }
}

async function callGeminiVision(base64Image: string, retailerKey: string): Promise<VisionAPIResponse> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const prompt = `
Extract the following information from this receipt image:
- Store name
- Date of purchase
- All line items with: product name, quantity, unit price, line total
- Any promotional savings shown on the receipt
- Subtotal, tax, and total amounts

Return as JSON with this structure:
{
  "store_name": "string",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "product_name": "string",
      "qty": number,
      "unit_price": number (in dollars),
      "line_total": number (in dollars),
      "promo_savings": number (in dollars, optional)
    }
  ],
  "subtotal": number (in dollars, optional),
  "tax": number (in dollars, optional),
  "total": number (in dollars)
}

Be precise with numbers and include all items shown on the receipt.
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image
            }
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();

  try {
    const text = data.candidates[0].content.parts[0].text;
    // Remove markdown code blocks if present
    const jsonText = text.replace(/```json\n?/, '').replace(/\n?```/, '');
    return JSON.parse(jsonText);
  } catch (e) {
    throw new Error(`Failed to parse Gemini response: ${(e as Error).message}`);
  }
}

async function callGPT4Vision(base64Image: string, retailerKey: string): Promise<VisionAPIResponse> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const prompt = `
Extract the following information from this receipt image:
- Store name
- Date of purchase
- All line items with: product name, quantity, unit price, line total
- Any promotional savings shown on the receipt
- Subtotal, tax, and total amounts

Return as JSON with this structure:
{
  "store_name": "string",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "product_name": "string",
      "qty": number,
      "unit_price": number (in dollars),
      "line_total": number (in dollars),
      "promo_savings": number (in dollars, optional)
    }
  ],
  "subtotal": number (in dollars, optional),
  "tax": number (in dollars, optional),
  "total": number (in dollars)
}

Be precise with numbers and include all items shown on the receipt.
`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();

  try {
    const text = data.choices[0].message.content;
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse GPT-4V response: ${(e as Error).message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:image/jpeg;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}