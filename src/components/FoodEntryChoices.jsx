import { useId } from 'react'

// One entry hierarchy shared by Log and the global Add food sheet.
export default function FoodEntryChoices({ onChoose }) {
  const id = useId()
  return <div className="food-entry-current border border-cobalt bg-card" aria-label="Add food methods">
    <div className="flex items-stretch">
      <button type="button" aria-label="Search foods" aria-describedby={`${id}-search`} onClick={() => onChoose('search')} className="accent-selection min-h-24 min-w-0 flex-1 cursor-pointer p-4 text-left transition hover:bg-cobalt-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt">
        <span className="eyebrow text-cobalt">Add food</span>
        <span className="serif mt-1 block text-[24px] leading-tight text-ink">Search foods</span>
        <span id={`${id}-search`} className="mt-1.5 block text-xs leading-relaxed text-muted">Find common groceries, brands, and whole foods.</span>
      </button>
      <button type="button" aria-label="Scan a package" aria-describedby={`${id}-scan`} onClick={() => onChoose('scan')} className="flex min-h-24 w-[92px] shrink-0 flex-col items-center justify-center gap-1.5 border-l border-cobalt text-cobalt transition hover:bg-cobalt hover:text-oncobalt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cobalt">
        <span aria-hidden="true" className="text-[25px] leading-none">▥</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em]">Scan</span>
      </button>
    </div>
    <p id={`${id}-scan`} className="border-t border-line px-4 py-2 text-[10.5px] leading-relaxed text-muted">Barcode unreadable? Scan the Nutrition Facts panel or enter the digits yourself.</p>
  </div>
}
