//
// ApiClient.mc — the single web request the app makes.
//
//   GET {apiBaseUrl}/api/today/summary
//
// Expected JSON (some target/remaining values may be null):
//   { "date": "YYYY-MM-DD",
//     "totals":   { "calories":n, "protein_g":n, "carbs_g":n, "fat_g":n },
//     "targets":  { "calories":n|null, "protein_g":n|null, "carbs_g":n|null, "fat_g":n|null },
//     "remaining":{ "calories":n|null } }
//
// Instantiated by BOTH the glance and the full view — they run in separate
// scopes and do not share memory — so the whole class is (:glance).
//
using Toybox.Application;
using Toybox.Communications;
using Toybox.Lang;

(:glance)
class ApiClient {

    // A Method(responseCode as Number, data as Dictionary or null) invoked when
    // the request completes: (200, dict) on success, or (code, anything) on any
    // failure. The owner decides what to do with it.
    hidden var _callback;

    function initialize(callback) {
        _callback = callback;
    }

    // Resolve the user-configured base URL, falling back to the packaged
    // default. Defensive throughout: an old API level, or a value the user
    // cleared to empty, must not crash the request.
    function baseUrl() {
        var url = null;

        // Application.Properties is CIQ 2.4+; guard so we don't reference a
        // symbol the device may not have.
        if (Application has :Properties) {
            url = Application.Properties.getValue("apiBaseUrl");
        }
        if (url == null) {
            // Pre-2.4 fallback.
            url = Application.getApp().getProperty("apiBaseUrl");
        }
        if (!(url instanceof Lang.String) || url.length() == 0) {
            url = "http://localhost:3001";
        }
        // Tolerate a trailing slash so "http://host:3001/" also works.
        if (url.substring(url.length() - 1, url.length()).equals("/")) {
            url = url.substring(0, url.length() - 1);
        }
        return url;
    }

    // Fire the request. The response arrives asynchronously in onReceive().
    function fetchSummary() {
        var url = baseUrl() + "/api/today/summary";
        var options = {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => {
                "Accept" => "application/json"
            },
            // Ask the framework to parse the body into a Dictionary for us.
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };
        Communications.makeWebRequest(url, {}, options, method(:onReceive));
    }

    // makeWebRequest callback. responseCode is the HTTP status (200 = OK) or a
    // negative Connect IQ error code (e.g. -104 no phone connection,
    // -300 request timed out, -400 invalid HTTP body / parse failure).
    function onReceive(responseCode, data) {
        _callback.invoke(responseCode, data);
    }
}
