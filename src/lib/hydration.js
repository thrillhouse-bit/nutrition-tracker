export const ML_PER_US_FL_OZ = 29.5735295625
export const DEFAULT_HYDRATION = { goal_ml: null, unit: 'ml', quick_add_ml: [250, 500, 750] }
export const toMillilitres = (value, unit) => Number(value) * (unit === 'oz' ? ML_PER_US_FL_OZ : 1)
export const quantityDraft = (ml, unit) => ({ ml, text: ml == null ? '' : String(Number((ml / (unit === 'oz' ? ML_PER_US_FL_OZ : 1)).toFixed(3))) })
export const editQuantity = (text, unit) => ({ text, ml: text.trim() === '' ? null : toMillilitres(text, unit) })
export const validWaterQuantity = (ml) => Number.isFinite(ml) && ml > 0 && ml <= 10000
export function waterAmount(ml, unit = 'ml') {
  const amount = Number(ml) || 0
  if (unit === 'oz') return `${Number((amount / ML_PER_US_FL_OZ).toFixed(1))} US fl oz`
  return amount >= 1000 ? `${Number((amount / 1000).toFixed(3))} L` : `${Number(amount.toFixed(1))} mL`
}
