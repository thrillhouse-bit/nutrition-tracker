//
// Helpers.mc — small pure helpers shared by the glance and the full view.
//
// Every function here is used by the glance, so each is marked (:glance) to be
// available in the glance scope. The annotation only ADDS them to that scope;
// they remain available to the full-app scope too.
//
using Toybox.Lang;
using Toybox.Math;

// Safe dictionary get. Returns null for a null / non-Dictionary input or a
// missing key, so a partial or garbled JSON payload can never throw mid-draw.
(:glance)
function dget(obj, key) {
    if (obj != null && obj instanceof Lang.Dictionary) {
        return obj.get(key);
    }
    return null;
}

// Format a JSON number (Number/Long or Float/Double) as a rounded integer
// string. A null value — a target or remaining that isn't set — renders as an
// em dash. kcal and gram figures are never shown with decimals.
(:glance)
function fmtInt(v) {
    if (v == null) {
        return "—"; // em dash
    }
    if (v instanceof Lang.Float || v instanceof Lang.Double) {
        return Math.round(v).toNumber().toString();
    }
    if (v instanceof Lang.Number || v instanceof Lang.Long) {
        return v.toString();
    }
    // Unexpected type (e.g. a string from a misbehaving API) — show it raw
    // rather than crash.
    return v.toString();
}

// True when v is a usable numeric value (any of the four numeric types).
(:glance)
function isNum(v) {
    return v instanceof Lang.Number || v instanceof Lang.Float
        || v instanceof Lang.Long   || v instanceof Lang.Double;
}
