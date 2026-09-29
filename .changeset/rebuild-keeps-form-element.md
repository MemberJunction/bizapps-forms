---
'@mj-biz-apps/forms-ng': patch
---

An embedded `<mj-form>` now reconnects when its `api-url`, `token` or `turnstile-site-key` attribute changes after the form has loaded. Before, the change removed the element from the page and the form disappeared: tearing down the old widget detached its own host element, so the rebuild saw an element that was no longer in the page and gave up.
