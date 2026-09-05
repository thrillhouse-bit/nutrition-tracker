// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { HydrationPreferencesSchema } from '../server/validation.js'
import { quantityDraft, editQuantity, ML_PER_US_FL_OZ } from '../src/lib/hydration.js'
import HydrationSettings from '../src/components/HydrationSettings.jsx'
import HydrationPanel from '../src/components/HydrationPanel.jsx'
import { api } from '../src/api/client.js'
vi.mock('../src/api/client.js', () => ({ api: { setHydrationPreferences: vi.fn(), addWaterEntry: vi.fn(), updateWaterEntry: vi.fn() } }))
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let root, box
afterEach(async () => { if (root) await act(async () => root.unmount()); box?.remove(); vi.clearAllMocks() })
const prefs = { goal_ml: 2000, unit: 'ml', quick_add_ml: [250, 500, 750] }
async function render(component) { box=document.createElement('div');document.body.append(box);root=createRoot(box);await act(async()=>root.render(component)) }
async function click(text) { await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click()) }
async function input(el,text) { await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}))}) }
async function select(value) { await act(async()=>{const el=document.querySelector('select');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))}) }
it('rejects nonfinite/out-of-bounds/unknown values; accepts clearing and partial updates',()=>{
  for(const value of [NaN, Infinity,-1,0,10001]) expect(HydrationPreferencesSchema.safeParse({goal_ml:value}).success).toBe(false)
  for(const value of [{},{unit:'litres'},{user_id:2,goal_ml:1000},{quick_add_ml:[250]},{quick_add_ml:[250,NaN,750]}]) expect(HydrationPreferencesSchema.safeParse(value).success).toBe(false)
  expect(HydrationPreferencesSchema.parse({goal_ml:null})).toEqual({goal_ml:null})
})
it('keeps canonical volume through display unit roundtrips',()=>{
  const ml=8*ML_PER_US_FL_OZ
  expect(quantityDraft(quantityDraft(ml,'oz').ml,'ml').ml).toBe(ml)
  expect(editQuantity('8','oz').ml).toBe(ml)
})
it('unit-only save does not overwrite goal or quick-add values',async()=>{
  const saved=vi.fn();api.setHydrationPreferences.mockResolvedValue({preferences:{...prefs,unit:'oz'}})
  await render(<HydrationSettings preferences={prefs} onClose={vi.fn()} onSaved={saved}/>);await select('oz');await click('Save preferences')
  expect(api.setHydrationPreferences).toHaveBeenCalledWith({unit:'oz'});expect(saved).toHaveBeenCalledOnce()
})
it('can remove goal and preserves edits after server failure',async()=>{
  api.setHydrationPreferences.mockRejectedValue(new Error('Offline'))
  await render(<HydrationSettings preferences={prefs} onClose={vi.fn()} onSaved={vi.fn()}/>);await click('Remove goal');await click('Save preferences')
  expect(api.setHydrationPreferences).toHaveBeenCalledWith({goal_ml:null})
  expect(document.querySelector('input').value).toBe('');expect(document.body.textContent).toContain('Offline')
})
it('invalid vessel focuses field; cancel preserves draft until explicit discard',async()=>{
  const close=vi.fn();await render(<HydrationSettings preferences={prefs} onClose={close} onSaved={vi.fn()}/>);
  const vessel=document.querySelectorAll('input')[1];await input(vessel,'0');await click('Save preferences')
  expect(document.activeElement).toBe(vessel);expect(vessel.getAttribute('aria-invalid')).toBe('true');expect(api.setHydrationPreferences).not.toHaveBeenCalled()
  await click('Cancel');expect(close).not.toHaveBeenCalled();await click('Discard changes');expect(close).toHaveBeenCalledOnce()
})
it('current-day progress caps visual but preserves actual intake; past days have no goal comparison',async()=>{
  await render(<HydrationPanel date={new Date()} hydration={{preferences:prefs,total_ml:2500,entries:[]}}/>)
  const progress=document.querySelector('[role="progressbar"]');expect(progress.getAttribute('aria-valuenow')).toBe('2000');expect(progress.getAttribute('aria-valuetext')).toContain('2.5 L')
  await act(async()=>root.render(<HydrationPanel date="2020-01-01" hydration={{preferences:prefs,total_ml:2500,entries:[]}}/>))
  expect(document.querySelector('[role="progressbar"]')).toBeNull();expect(document.body.textContent).toContain('not applied to past days')
})
