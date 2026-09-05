# Plan readability — 5 September 2026

Visible ownership remains `CanonicalPlan.jsx` and `AdaptiveFuelPlan.jsx`.
Legacy `Plan.jsx` is unchanged. The screen follows the existing daily loop in
`UX-CONTRACT.md`: targets, their explanation, then training and actions.

The full local date uses a semantic time element and readable 16px Archivo
instead of tiny tracked capitals. It wraps below the title on narrow screens.
The one accent-wash target panel uses 32px Bodoni numerals, 14px labels and
logged/remaining values; it is the page's primary visual anchor. Clear section
headings group explanations and training, using existing ink, paper and account
accent tokens from `src/index.css` / `src/lib/accentTheme.js`. No palette, global
token, shared component, or calculation changes are introduced.

Safety messages, frozen-history state and overrides remain visible. Research
detail still opens through the canonical Why/Sheet control. Manual targets
retain their independent no-automatic-calculation description. Empty planned
sessions no longer imply no synced training. A failed fetch now offers retry.

Verification: focused AFP and canonical planning component suites cover the
new heading order, visible warning/progress data, date semantics and failed-load
recovery alongside the existing profile, override and session behavior tests.
Real Chrome fixture checks at 320px, 390px and 1024px found no horizontal
overflow. The rendered date measured 16px. Manual targets, incomplete setup,
loading, frozen history and error/retry states were inspected. The explanation
Sheet opened and Escape restored focus to its trigger. Browser data was mocked;
these checks do not claim new live wearable or scientific validation.
