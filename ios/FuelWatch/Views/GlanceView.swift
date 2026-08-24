// GlanceView.swift — the one screen. A short, scrollable stack of big rows:
//   1. the NEXT FUELING ACTION (the headline) + a reachable "Why?" control;
//   2. an honest label when the data is Sample or Stale;
//   3. the PRE-WORKOUT fuel target + deadline (when a session is on the day);
//   4. the POST-WORKOUT recovery target (when present);
//   5. today's CALORIE and PROTEIN progress as rings;
//   6. "Log later on iPhone" — the only capture affordance (a handoff);
//   7. a small "updated Nm ago" footer.
//
// Design intent: glanceable, large tap targets, short copy. No dense grids. It
// renders `PlanSummary` exactly as received — it derives no fueling numbers.

import SwiftUI

struct GlanceView: View {
    @EnvironmentObject private var store: SummaryStore
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        ScrollView {
            if let summary = store.summary {
                VStack(alignment: .leading, spacing: 14) {
                    HeadlineSection(summary: summary)
                    StatusLabels(isDemo: store.isDemo, isStale: store.isStale)

                    if let pre = summary.preWorkout {
                        FuelWindowCard(
                            title: preTitle(summary),
                            macro: pre,
                            deadline: summary.preWorkoutBy ?? summary.workoutTime,
                            tint: .orange,
                            systemImage: "bolt.fill"
                        )
                    }
                    if let post = summary.postWorkout {
                        FuelWindowCard(
                            title: "Recover after",
                            macro: post,
                            deadline: nil,
                            tint: .green,
                            systemImage: "arrow.clockwise.heart.fill"
                        )
                    }

                    ProgressSection(calories: summary.calories, protein: summary.protein)
                    LogLaterButton()

                    if let rel = store.updatedRelative {
                        Text("Updated \(rel)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
                .padding(.vertical, 4)
            } else {
                EmptyState()
            }
        }
        .navigationTitle("Fuel")
    }

    /// "Before Evening Run" when we know the label, else a plain window title.
    private func preTitle(_ s: PlanSummary) -> String {
        if let label = s.workoutLabel, !label.isEmpty { return "Before \(label)" }
        return "Before your workout"
    }
}

// MARK: - Headline (next action + Why?)

private struct HeadlineSection: View {
    let summary: PlanSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(summary.recommendationTitle)
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)

            if !summary.recommendationDetail.isEmpty {
                Text(summary.recommendationDetail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Every recommendation must be able to answer "why?". Small control,
            // pushes the full rationale. Disabled only if there is genuinely no
            // rationale to show (kept visible as a hint that none was provided).
            NavigationLink {
                WhyView(title: summary.recommendationTitle,
                        detail: summary.recommendationDetail,
                        why: summary.why)
            } label: {
                Label("Why?", systemImage: "questionmark.circle")
                    .font(.footnote)
            }
            .buttonStyle(.bordered)
        }
    }
}

// MARK: - Honest Sample / Stale labels

private struct StatusLabels: View {
    let isDemo: Bool
    let isStale: Bool

    var body: some View {
        if isDemo || isStale {
            HStack(spacing: 6) {
                if isDemo {
                    Chip(text: "Sample", systemImage: "testtube.2", tint: .purple)
                }
                if isStale {
                    Chip(text: "Stale — open iPhone", systemImage: "exclamationmark.triangle.fill", tint: .yellow)
                }
            }
        }
    }
}

private struct Chip: View {
    let text: String
    let systemImage: String
    let tint: Color

    var body: some View {
        Label(text, systemImage: systemImage)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.25), in: Capsule())
            .foregroundStyle(tint)
    }
}

// MARK: - Fuel window card (pre / post workout)

private struct FuelWindowCard: View {
    let title: String
    let macro: MacroTarget
    let deadline: String?
    let tint: Color
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tint)
            Text(FuelFormat.macro(macro))
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
            if let deadline, !deadline.isEmpty {
                Text("by \(deadline)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - Today's progress rings

private struct ProgressSection: View {
    let calories: Progress
    let protein: Progress

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            MetricRow(label: "Calories", unit: "kcal", progress: calories, tint: .blue)
            MetricRow(label: "Protein", unit: "g", progress: protein, tint: .pink)
        }
    }
}

private struct MetricRow: View {
    let label: String
    let unit: String
    let progress: Progress
    let tint: Color

    var body: some View {
        HStack(spacing: 12) {
            ProgressRing(fraction: progress.fraction, tint: tint)
                .frame(width: 44, height: 44)
                .overlay(
                    Text("\(Int((progress.fraction * 100).rounded()))%")
                        .font(.system(size: 12, weight: .semibold))
                )
            VStack(alignment: .leading, spacing: 1) {
                Text(label).font(.subheadline.weight(.semibold))
                Text(FuelFormat.consumedOfTarget(progress, unit: unit))
                    .font(.footnote)
                Text("\(FuelFormat.int(progress.remaining)) \(unit) left")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
    }
}

/// A minimal progress ring from `Progress.fraction`. Trim + stroke keeps it
/// dependency-free and portable across watchOS versions (no `Gauge` required).
private struct ProgressRing: View {
    let fraction: Double
    let tint: Color

    var body: some View {
        ZStack {
            Circle().stroke(tint.opacity(0.2), lineWidth: 6)
            Circle()
                .trim(from: 0, to: max(0.001, min(1, fraction)))
                .stroke(tint, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

// MARK: - The handoff button (the only capture affordance)

private struct LogLaterButton: View {
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        VStack(spacing: 4) {
            Button {
                session.requestLogLater()
            } label: {
                Label("Log later on iPhone", systemImage: "iphone.and.arrow.forward")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            // Honest feedback: the watch never claims the phone captured
            // anything — only that the handoff was sent or safely queued.
            if let note = handoffNote {
                Text(note)
                    .font(.caption2)
                    .foregroundStyle(handoffTint)
            }
        }
    }

    private var handoffNote: String? {
        switch session.lastHandoff {
        case .idle:            return nil
        case .sent:            return "Sent to iPhone"
        case .queued:          return "Queued — will reach iPhone"
        case .failed(let msg): return msg
        }
    }

    private var handoffTint: Color {
        if case .failed = session.lastHandoff { return .red }
        return .secondary
    }
}

// MARK: - Empty state (never received a summary yet)

private struct EmptyState: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "iphone.gen3.radiowaves.left.and.right")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("Waiting for your plan")
                .font(.headline)
            Text("Open the Fuel app on your iPhone to sync today's plan.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20)
    }
}
