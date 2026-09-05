import { useId } from 'react'

// One entry hierarchy shared by Log and the global Add food sheet.
export default function FoodEntryChoices({ onChoose }) {
  const id = useId()
  return <div className="grid gap-3 sm:grid-cols-2" aria-label="Add food methods">
    <button type="button" aria-label="Search foods" aria-describedby={`${id}-search`} onClick={() => onChoose('search')} className="flex min-h-24 cursor-pointer items-center justify-between gap-4 border border-cobalt bg-cobalt-soft p-4 text-left transition hover:bg-fill active:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt">
      <span><span className="serif block text-[23px] leading-tight text-cobalt">Search foods</span><span id={`${id}-search`} className="mt-1.5 block text-xs leading-relaxed text-muted">Find a food by name, or enter its nutrition yourself.</span></span>
      <span aria-hidden="true" className="text-lg text-cobalt">→</span>
    </button>
    <button type="button" aria-label="Scan a package" aria-describedby={`${id}-scan`} onClick={() => onChoose('scan')} className="flex min-h-24 cursor-pointer items-center justify-between gap-4 border border-line-strong p-4 text-left transition hover:bg-fill active:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt">
      <span><span className="serif block text-[23px] leading-tight text-ink">Scan a package</span><span id={`${id}-scan`} className="mt-1.5 block text-xs leading-relaxed text-muted">Look up a barcode, or read the Nutrition Facts panel.</span></span>
      <span aria-hidden="true" className="text-lg text-muted">→</span>
    </button>
  </div>
}
