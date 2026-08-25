// @vitest-environment jsdom
//
// Regression test for a live production bug (production-verification audit,
// 25 Aug 2026): Postgres bigint/numeric columns round-trip over JSON as
// STRINGS, not numbers (confirmed against the live deployed API: a food's
// `id` came back as "4", a string, not 4). FoodConfirm's submit() sent that
// string straight through as `food_id` on the "log this food as-is" path
// (no edits — the single most common action in the app: confirm a barcode
// scan, a search result, or a recent food and log it), and the server's
// food_id schema is deliberately strict z.number(). Reproduced live against
// production: POST /entries with an unconverted string food_id returned
// 400 "food_id: Expected number, received string"; the identical request
// with Number(food_id) returned 201. This test proves the fix at the exact
// call site that broke: render FoodConfirm with a food prop shaped exactly
// like a real API response (string id) and confirm the submitted payload's
// food_id is a number.
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import FoodConfirm from '../src/components/FoodConfirm.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) {
    document.body.removeChild(container)
    container = null
  }
})

// Shaped exactly like a real /api/foods or /api/lookup response: id AND
// every numeric nutrient field are strings, because that's what Postgres
// bigint/numeric columns actually serialize as (measured live, not assumed).
const REAL_API_FOOD = {
  id: '4',
  barcode: null,
  name: 'Confirm Bug Food',
  brand: null,
  serving_size: null,
  serving_unit: null,
  calories: '250',
  protein_g: '20',
  carbs_g: '10',
  fat_g: '8',
  fiber_g: null,
  sugar_g: null,
  sodium_mg: null,
  source: 'manual',
}

describe('FoodConfirm: logging an existing food unedited', () => {
  it('sends food_id as a NUMBER, not the string the API returned it as', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    let submitted = null
    await act(async () => {
      root.render(
        <FoodConfirm
          food={REAL_API_FOOD}
          onLog={(payload) => { submitted = payload }}
          onBack={() => {}}
          logging={false}
        />,
      )
    })

    const logButton = Array.from(container.querySelectorAll('button')).find((b) => /log/i.test(b.textContent))
    expect(logButton).toBeTruthy()
    await act(async () => {
      logButton.click()
    })

    expect(submitted).toBeTruthy()
    expect(submitted.food_id).toBe(4)
    expect(typeof submitted.food_id).toBe('number') // NOT '4' — that 400s against the server's strict z.number() schema
  })
})
