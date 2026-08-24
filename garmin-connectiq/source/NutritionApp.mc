//
// NutritionApp.mc — application entry point.
//
// A Connect IQ "widget" with a "glance" (CIQ 3.1+). Two surfaces:
//
//   * the glance (compact strip in the glance carousel) shows today's
//     kcal consumed/target with remaining;
//   * the full widget view shows consumed, target, remaining, a progress
//     bar, and the primary macros (protein / carbs / fat) when present.
//
// Both pull today's numbers from the nutrition-tracker web API
// (GET {apiBaseUrl}/api/today/summary) via Communications.makeWebRequest.
//
using Toybox.Application;
using Toybox.WatchUi;

class NutritionApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    // Called on application start up.
    function onStart(state) {
    }

    // Called when the application is shutting down.
    function onStop(state) {
    }

    // The initial (full) view shown when the user opens the widget, paired with
    // the input delegate that handles button/tap events for it.
    function getInitialView() {
        var view = new SummaryView();
        var delegate = new SummaryDelegate(view);
        return [ view, delegate ];
    }

    // The compact glance shown in the glance carousel. Marked (:glance) so the
    // compiler includes it — and everything it references — in the separate,
    // memory-limited glance scope. Anything the glance touches (the glance view,
    // ApiClient, the shared helpers) carries the same annotation.
    (:glance)
    function getGlanceView() {
        return [ new NutritionGlanceView() ];
    }

    // Fired when the user edits a setting (e.g. apiBaseUrl) from the Connect IQ
    // mobile app / Garmin Express. Just repaint; the next onShow re-fetches from
    // the new URL.
    function onSettingsChanged() {
        WatchUi.requestUpdate();
    }
}
