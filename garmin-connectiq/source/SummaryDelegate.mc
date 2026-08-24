//
// SummaryDelegate.mc — input handling for the full widget view.
//
// A press of START / SELECT (or a screen tap on touch devices) re-fetches
// today's numbers. BehaviorDelegate maps the device's primary action — a
// physical button on the fenix line, a tap on touch models — to onSelect().
//
using Toybox.WatchUi;

class SummaryDelegate extends WatchUi.BehaviorDelegate {

    hidden var _view;

    function initialize(view) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    function onSelect() {
        _view.refresh();
        return true; // handled
    }
}
