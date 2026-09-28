# ToonLab Pro analytics

ToonLab Pro uses the Hyperbond Studio GA4 property **ToonLab Pro** and web
stream **ToonLab Pro Web** (`G-78D373M2C8`). Vite injects
`src/analytics/googleAnalytics.js` into every HTML entry point.

The GA4 property uses Singapore reporting time, USD reporting currency, and
14-month event and user-data retention. Enhanced measurement and email
redaction are enabled. URL redaction covers common identity, authentication,
prompt, project, file, and redirect query parameters.

Analytics is disabled on `localhost`, `127.0.0.1`, and `::1` unless the page
has `?ga_debug=1`. Query strings, URL fragments, form values, file names, and
exception messages are not sent. Google Signals, ad storage, ad user data, and
ad personalization are disabled.

## Core events

| Journey | Events |
| --- | --- |
| Acquisition | `page_view`, `select_item`, `lab_open` |
| Activation | `parameter_changed`, `tool_action`, `funnel_step` |
| Creation | `generation_completed`, `artifact_saved`, `export_completed` |
| Content | `view_item`, `file_selected` |
| Reliability | `api_request`, `app_error`, `render_context_lost`, `performance_snapshot` |
| Retention | `engagement_milestone` at 30, 120, 300, and 600 seconds |

`funnel_step` uses the bounded `funnel_name` and `funnel_step` parameters.
Built-in funnels are `product_activation`, `creation`, and `subscription`.

GA4 has event-scoped custom dimensions for App Area, Lab ID, Action Name,
Funnel Name, Funnel Step, Event Result, Duration Bucket, Control ID, API Area,
Error Type, and Renderer. The **ToonLab Pro — Activation & Creation**
exploration contains:

- **Activation funnel:** page view → lab open → parameter changed → artifact
  saved.
- **Creation funnel:** tool action → generation completed → artifact saved →
  export completed.

Both funnel tabs show elapsed time between steps.

## Explicit instrumentation

Automatic instrumentation recognizes stable control IDs and common actions.
For important UI, prefer explicit attributes:

```html
<button
  data-analytics-event="preset_published"
  data-analytics-action="publish"
  data-analytics-component="preset_toolbar"
>
  Publish
</button>
```

Product code can also call the public module or `window.toonlabAnalytics`:

```js
import {
  setAnalyticsConsent,
  setAnalyticsUser,
  trackEvent,
  trackFunnelStep,
} from '/src/analytics/googleAnalytics.js';

setAnalyticsUser(account.id, { plan: account.plan });
trackEvent('tutorial_complete', { tutorial_id: 'first_asset' });
trackFunnelStep('subscription', 'purchase_completed', {
  plan: 'pro',
  value: 29,
  currency: 'USD',
});
setAnalyticsConsent(true);
```

Never send names, email addresses, prompts, project names, asset names, file
names, exception messages, or other user-authored content as event parameters.
