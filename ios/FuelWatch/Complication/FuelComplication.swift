// FuelComplication.swift — a MINIMAL WidgetKit accessory complication.
//
// TARGET: this file belongs to a SEPARATE Widget Extension target (e.g.
// "FuelComplicationExtension"), NOT the watch-app target. It provides that
// extension's @main entry point. `SummaryPersistence.swift`, `PlanSummary.swift`
// and `HealthModel.swift` (for `FuelJSON`) must ALSO be members of this
// extension target so it can decode the shared snapshot.
//
// DATA SOURCE: summary-only, read from the shared App Group defaults that the
// watch app writes (`SummaryPersistence.load()`). The complication does NO
// network, NO HealthKit, and NO WatchConnectivity — it only reflects the last
// summary the phone sent. When a piece isn't available it shows a neutral
// placeholder, never a fabricated or stale-as-live figure.
//
// APP GROUP / ENTITLEMENT ASSUMPTIONS:
//   • The extension target needs the SAME App Group capability as the app,
//     with the id in `SummaryPersistence.appGroupIdentifier` (a `// TODO:`).
//   • The app calls `WidgetCenter.shared.reloadAllTimelines()` on each new
//     summary (see SummaryStore), so this timeline refreshes promptly; the
//     `.after` policy below is just a backstop.
//
// UNBUILT: no Xcode/watchOS SDK here. The `.containerBackground` /
// `accessoryCircular` gauge APIs assume a watchOS 10+ SDK; see notes inline.

import WidgetKit
import SwiftUI

// MARK: - Timeline entry

struct FuelEntry: TimelineEntry {
    let date: Date
    let snapshot: FuelSnapshot?

    var summary: PlanSummary? { snapshot?.summary }
    var isStale: Bool {
        guard let s = summary else { return false }
        return SummaryPersistence.isStale(s, now: date)
    }
    var isDemo: Bool { summary?.isDemo ?? false }
}

// MARK: - Provider

struct FuelProvider: TimelineProvider {

    /// Shown while the real snapshot loads / in the gallery. Neutral, no claim.
    func placeholder(in context: Context) -> FuelEntry {
        FuelEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (FuelEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FuelEntry>) -> Void) {
        let entry = currentEntry()
        // Backstop refresh; the app also nudges us via WidgetCenter on new data.
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: entry.date)
            ?? entry.date.addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func currentEntry() -> FuelEntry {
        FuelEntry(date: Date(), snapshot: SummaryPersistence.load())
    }
}

// MARK: - Views

struct FuelComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FuelEntry

    var body: some View {
        content
            .modifier(AccessoryContainer())
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryCircular:   CircularView(entry: entry)
        case .accessoryInline:     InlineView(entry: entry)
        default:                   RectangularView(entry: entry) // .accessoryRectangular
        }
    }
}

/// Two short lines: the next-action headline + a compact stat. Summary only.
private struct RectangularView: View {
    let entry: FuelEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "fork.knife")
                Text(headline).lineLimit(1)
                    .font(.headline)
            }
            Text(statLine)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var headline: String {
        guard let s = entry.summary else { return "No plan yet" }
        let prefix = entry.isStale ? "Stale · " : (entry.isDemo ? "Sample · " : "")
        return prefix + s.recommendationTitle
    }

    private var statLine: String {
        guard let s = entry.summary else { return "Open iPhone to sync" }
        return "\(FuelFormat.int(s.calories.remaining)) kcal · "
             + "\(FuelFormat.int(s.protein.remaining))g protein left"
    }
}

/// A small calorie ring with the percent inside. Summary only.
private struct CircularView: View {
    let entry: FuelEntry

    var body: some View {
        if let s = entry.summary {
            // accessoryCircular gauge style is watchOS 9+. The gauge itself
            // conveys progress; the label keeps digits tiny.
            Gauge(value: s.calories.fraction) {
                Image(systemName: "fork.knife")
            } currentValueLabel: {
                Text("\(Int((s.calories.fraction * 100).rounded()))")
            }
            .gaugeStyle(.accessoryCircular)
        } else {
            // Neutral placeholder: an empty ring, no number implying data.
            Gauge(value: 0) {
                Image(systemName: "fork.knife")
            } currentValueLabel: {
                Text("–")
            }
            .gaugeStyle(.accessoryCircular)
        }
    }
}

/// One line for the inline slot (e.g. above the watch face time). Summary only.
private struct InlineView: View {
    let entry: FuelEntry

    var body: some View {
        if let s = entry.summary {
            Label("\(FuelFormat.int(s.calories.remaining)) kcal left",
                  systemImage: "fork.knife")
        } else {
            Label("Open iPhone", systemImage: "fork.knife")
        }
    }
}

/// watchOS 10+ widgets want an explicit container background. Applied through a
/// modifier so the availability check stays out of the view bodies. Older SDKs
/// simply skip it.
private struct AccessoryContainer: ViewModifier {
    func body(content: Content) -> some View {
        if #available(watchOS 10.0, *) {
            content.containerBackground(.clear, for: .widget)
        } else {
            content
        }
    }
}

// MARK: - Widget entry point (of the Widget Extension target)

@main
struct FuelComplication: Widget {
    let kind = "FuelComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FuelProvider()) { entry in
            FuelComplicationView(entry: entry)
        }
        .configurationDisplayName("Fuel")
        .description("Your next fueling action and today's remaining calories/protein.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline])
    }
}
