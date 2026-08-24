//
// SummaryView.mc — the full widget view.
//
// Loading / error / ok states. When ok, it draws:
//   * a "TODAY · KCAL" header
//   * the consumed kcal as a large number
//   * "of <target>"
//   * a progress bar (only when a target is set)
//   * remaining kcal ("<n> remaining", "<n> over", or "— remaining")
//   * a macros row "P .. C .. F .. g" (only when any macro is present)
//
// Not (:glance): this is the full-app scope, which has the normal memory budget.
//
using Toybox.WatchUi;
using Toybox.Graphics;
using Toybox.Lang;

class SummaryView extends WatchUi.View {

    hidden var _client;
    hidden var _state;    // :loading | :ok | :error
    hidden var _data;     // parsed summary Dictionary (when :ok)
    hidden var _errCode;  // last status / error code (when :error)

    function initialize() {
        View.initialize();
        _state = :loading;
        _data = null;
        _errCode = 0;
        _client = new ApiClient(method(:onData));
    }

    function onLayout(dc) {
    }

    // Fetch whenever the view is shown. The delegate also calls refresh() on a
    // button press / tap.
    function onShow() {
        refresh();
    }

    function refresh() {
        _state = :loading;
        WatchUi.requestUpdate();
        _client.fetchSummary();
    }

    function onData(responseCode, data) {
        if (responseCode == 200 && data != null) {
            _data = data;
            _state = :ok;
        } else {
            _errCode = responseCode;
            _state = :error;
        }
        WatchUi.requestUpdate();
    }

    function onUpdate(dc) {
        var w = dc.getWidth();
        var h = dc.getHeight();

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);

        if (_state == :loading) {
            dc.drawText(w / 2, h / 2, Graphics.FONT_MEDIUM, "Loading…",
                Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
            return;
        }
        if (_state == :error) {
            drawError(dc, w, h);
            return;
        }
        drawSummary(dc, w, h);
    }

    // ---- error state -------------------------------------------------------

    hidden function drawError(dc, w, h) {
        dc.setColor(Graphics.COLOR_YELLOW, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.34, Graphics.FONT_SMALL, "No data",
            Graphics.TEXT_JUSTIFY_CENTER);
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.48, Graphics.FONT_XTINY, errDetail(),
            Graphics.TEXT_JUSTIFY_CENTER);
        dc.drawText(w / 2, h * 0.62, Graphics.FONT_XTINY, "Press START to retry",
            Graphics.TEXT_JUSTIFY_CENTER);
    }

    hidden function errDetail() {
        // Negative codes are Connect IQ transport errors; positive are HTTP
        // statuses returned by the server.
        if (_errCode < 0) {
            return "No phone / network (" + _errCode.toString() + ")";
        }
        if (_errCode == 0) {
            return "Request failed";
        }
        return "HTTP " + _errCode.toString();
    }

    // ---- ok state ----------------------------------------------------------

    hidden function drawSummary(dc, w, h) {
        var totals    = dget(_data, "totals");
        var targets   = dget(_data, "targets");
        var remaining = dget(_data, "remaining");

        var kcal       = dget(totals, "calories");
        var kcalTarget = dget(targets, "calories");
        var kcalRemain = dget(remaining, "calories");

        // header
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.10, Graphics.FONT_XTINY, "TODAY · KCAL",
            Graphics.TEXT_JUSTIFY_CENTER);

        // big consumed number
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.20, Graphics.FONT_NUMBER_MEDIUM, fmtInt(kcal),
            Graphics.TEXT_JUSTIFY_CENTER);

        // "of <target>"
        dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.44, Graphics.FONT_XTINY, "of " + fmtInt(kcalTarget),
            Graphics.TEXT_JUSTIFY_CENTER);

        drawProgress(dc, w, h, kcal, kcalTarget);
        drawRemaining(dc, w, h, kcalRemain);
        drawMacros(dc, w, h, totals);
    }

    // Progress bar, only when a positive target exists. Turns red past 100%.
    hidden function drawProgress(dc, w, h, kcal, target) {
        if (!isNum(target) || target <= 0) {
            return;
        }
        var consumed = isNum(kcal) ? kcal.toFloat() : 0.0;
        var frac = consumed / target.toFloat();
        if (frac < 0.0) { frac = 0.0; }
        var over = frac > 1.0;
        if (frac > 1.0) { frac = 1.0; }

        var barW = (w * 0.6).toNumber();
        var barH = 8;
        var barX = (w - barW) / 2;
        var barY = (h * 0.56).toNumber();

        dc.setColor(Graphics.COLOR_DK_GRAY, Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(barX, barY, barW, barH, 3);

        dc.setColor(over ? Graphics.COLOR_RED : Graphics.COLOR_GREEN,
            Graphics.COLOR_TRANSPARENT);
        dc.fillRoundedRectangle(barX, barY, (barW * frac).toNumber(), barH, 3);
    }

    // Remaining line. Null -> "— remaining"; negative -> "<n> over" (red).
    hidden function drawRemaining(dc, w, h, remain) {
        var text;
        var color;
        if (remain == null) {
            text = "— remaining";
            color = Graphics.COLOR_LT_GRAY;
        } else if (isNum(remain) && remain < 0) {
            text = fmtInt(-remain) + " over";
            color = Graphics.COLOR_RED;
        } else {
            text = fmtInt(remain) + " remaining";
            color = Graphics.COLOR_GREEN;
        }
        dc.setColor(color, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.62, Graphics.FONT_TINY, text,
            Graphics.TEXT_JUSTIFY_CENTER);
    }

    // Macros row, only when at least one macro is present.
    hidden function drawMacros(dc, w, h, totals) {
        var protein = dget(totals, "protein_g");
        var carbs   = dget(totals, "carbs_g");
        var fat     = dget(totals, "fat_g");

        if (protein == null && carbs == null && fat == null) {
            return;
        }

        var line = "P " + fmtInt(protein)
                 + "   C " + fmtInt(carbs)
                 + "   F " + fmtInt(fat) + "  g";
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 0.80, Graphics.FONT_XTINY, line,
            Graphics.TEXT_JUSTIFY_CENTER);
    }
}
