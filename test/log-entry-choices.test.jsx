// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LogView from '../src/components/LogView.jsx'
import FoodEntryChoices from '../src/components/FoodEntryChoices.jsx'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, container
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove() })
async function render(component) { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); await act(async () => root.render(component)); return container }
describe('Consolidated food entry', () => {
  it('offers exactly two distinct entry methods with functional destinations', async () => {
    const choose = vi.fn()
    const el = await render(<FoodEntryChoices onChoose={choose} />)
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(['Search foods','Scan a package'])
    await act(async () => { buttons[0].click(); buttons[1].click() })
    expect(choose.mock.calls).toEqual([['search'],['scan']])
  })
  it('preserves recents, meal rows and serving-adjusted meal summaries', async () => {
    const relog = vi.fn(), edit = vi.fn(), remove = vi.fn()
    const food = {id:3,name:'Yogurt',calories:100,protein_g:10,carbs_g:8,fat_g:4,serving_size:100,serving_unit:'g'}
    const entry = {id:8,food,meal:'snack',servings_consumed:2}
    const el = await render(<LogView date={new Date()} openAdd={vi.fn()} online entries={[entry]} recents={[food]} onRelog={relog} onEditEntry={edit} onDeleteEntry={remove} />)
    expect(el.textContent).toContain("Today's log")
    expect(el.textContent).toContain('Snack')
    expect(el.textContent).toMatch(/Protein.*20/s)
    expect(el.textContent).not.toMatch(/Photograph the label|Enter it manually|Camera ready/)
    await act(async () => { el.querySelector('[aria-label="Re-log Yogurt"]').click(); el.querySelector('[aria-label="Delete entry"]').click() })
    expect(relog).toHaveBeenCalledWith(food,'recent')
    expect(remove).toHaveBeenCalledWith(8)
  })
  it('preserves an explicit offline queue explanation', async () => {
    const el = await render(<LogView date={new Date()} openAdd={vi.fn()} online={false} />)
    expect(el.textContent).toContain('Entries queue and sync when you reconnect.')
  })
})
