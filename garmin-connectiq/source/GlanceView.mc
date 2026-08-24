//
// GlanceView.mc — the compact glance.
//
// Two short left-aligned lines: a title, and today's kcal as
// "consumed/target kcal  <remaining> left". The whole class is (:glance) so it
// compiles into the memory-limited glance scope.
//
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Lang;

(:glance)
class NutritionGlanceView extends WatchUi.GlanceView {

    hidden var _client;
    hidden var _state;   // :loading | :ok | :error
    hidden var _data;    // parsed summary Dictionary (when :ok)

    function initialize() {
        GlanceView.initialize();
        _state = :loading;
        _data = null;
        _client = new ApiClient(method(:onData));
    }

    // Re-fetch each time the glance scrolls into view so it reflects the latest
    // day's numbers.
    function onShow() {
        _state = :loading;
        _client.fetchSummary();
        WatchUi.requestUpdate();
    }

    function onData(responseCode, data) {
        if (responseCode == 200 && data != null) {
            _data = data;
            _state = :ok;
        } else {
            _state = :error;
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);

        var h = dc.getHeight();
        var lineH = dc.getFontHeight(Graphics.FONT_GLANCE);
        var midY = h / 2;

        // Title on the upper line, value on the lower line, stacked around the
        // vertical middle of the glance strip.
        dc.drawText(0, midY - lineH, Graphics.FONT_GLANCE, "Nutrition",
            Graphics.TEXT_JUSTIFY_LEFT);
        dc.drawText(0, midY, Graphics.FONT_GLANCE, valueLine(),
            Graphics.TEXT_JUSTIFY_LEFT);
    }

    // Build the second line from the current state.
    hidden function valueLine() {
        if (_state == :loading) { return "Loading…"; }
        if (_state == :error)   { return "No data — check URL"; }

        var totals    = dget(_data, "totals");
        var targets   = dget(_data, "targets");
        var remaining = dget(_data, "remaining");

        var kcal   = fmtInt(dget(totals, "calories"));
        var target = fmtInt(dget(targets, "calories"));
        var line   = kcal + "/" + target + " kcal";

        // Append "<n> left" only when the API supplied a remaining figure.
        var rem = dget(remaining, "calories");
        if (rem != null) {
            line = line + "  " + fmtInt(rem) + " left";
        }
        return line;
    }
}
