// WhyView.swift — the rationale screen, pushed from the glance's "Why?" control.
//
// Every recommendation the phone sends carries its `why` (a short list of
// plain-language reasons — see PlanSummary.swift and the backend's plan.js,
// where each adjustment names its reason and its source signal). This view
// simply lists them so the wearer can always answer "why is it telling me
// this?" without opening the phone. It renders only what was sent; it invents
// no rationale.

import SwiftUI

struct WhyView: View {
    let title: String
    let detail: String
    let why: [String]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(title)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)

                if !detail.isEmpty {
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Divider()

                if why.isEmpty {
                    // Honest: don't fabricate a reason. Say none came with it.
                    Text("No rationale was included with this recommendation.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(Array(why.enumerated()), id: \.offset) { _, reason in
                        HStack(alignment: .top, spacing: 6) {
                            Text("•").font(.body)
                            Text(reason)
                                .font(.footnote)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
        }
        .navigationTitle("Why?")
    }
}
