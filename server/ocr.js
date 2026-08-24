// Label OCR via Claude vision. Traditional OCR libraries choke on curved
// packaging and uneven lighting; a vision model reads the Nutrition Facts panel
// far more reliably and returns it already structured.
//
// The result is constrained to a strict JSON schema (Zod → output_config.format)
// so we always get back the exact `foods` shape, never prose to parse.
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'

// Default to Opus 5 (the SDK's recommended default); override with ANTHROPIC_MODEL.
// For this narrow extraction task, ANTHROPIC_MODEL=claude-haiku-4-5 (or
// claude-sonnet-5) cuts per-scan cost substantially — your call.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5'

const num = () => z.number().nullable()

const LabelSchema = z.object({
  name: z.string().nullable(),
  brand: z.string().nullable(),
  serving_size: num(),
  serving_unit: z.string().nullable(),
  calories: num(),
  protein_g: num(),
  carbs_g: num(),
  fat_g: num(),
  fiber_g: num(),
  sugar_g: num(),
  sodium_mg: num(),
})

const INSTRUCTION = `You are reading a photograph of a food's Nutrition Facts panel.
Extract the values for ONE serving exactly as printed on the label.

Rules:
- serving_size / serving_unit: the numeric amount and its unit for a single
  serving (e.g. 30 and "g", or 1 and "cup"). If the label lists a household
  measure and a gram weight, prefer the gram weight.
- All macro values are grams; sodium is milligrams; calories is kcal.
- Report the per-serving numbers, NOT per-container, even if the panel shows both.
- Use null for any field that is not visible or not printed. Do not guess or
  compute values that aren't on the label.
- name: the product name if legible on the packaging, else null. brand likewise.`

export function ocrConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
}

export async function parseLabel({ imageBase64, mediaType = 'image/jpeg' }) {
  if (!ocrConfigured()) {
    const err = new Error(
      'Label OCR is not configured. Set ANTHROPIC_API_KEY in the server environment.',
    )
    err.status = 501
    throw err
  }
  if (!imageBase64) {
    const err = new Error('No image supplied.')
    err.status = 400
    throw err
  }

  const client = new Anthropic()
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    // Low effort: reading a printed panel into fixed fields is not a reasoning
    // task, so don't pay for deep thinking on every scan.
    output_config: { effort: 'low', format: zodOutputFormat(LabelSchema) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: INSTRUCTION },
        ],
      },
    ],
  })

  const parsed = response.parsed_output
  if (!parsed) {
    const err = new Error('Could not read the nutrition label from that photo.')
    err.status = 422
    throw err
  }

  return {
    barcode: null,
    name: parsed.name || 'Scanned label',
    brand: parsed.brand || null,
    serving_size: parsed.serving_size,
    serving_unit: parsed.serving_unit || 'serving',
    calories: parsed.calories,
    protein_g: parsed.protein_g,
    carbs_g: parsed.carbs_g,
    fat_g: parsed.fat_g,
    fiber_g: parsed.fiber_g,
    sugar_g: parsed.sugar_g,
    sodium_mg: parsed.sodium_mg,
    source: 'ocr',
    raw_api_response: { model: MODEL, parsed },
  }
}
