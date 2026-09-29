---
'@mj-biz-apps/forms-ng': patch
---

Published forms now load the images for later screens in the background, so picture-choice options and ending-screen images appear with their screen instead of several seconds after it on a slow mobile connection. The welcome image is requested at high priority, and prefetching waits for it to load or fail, or for the respondent to press Start; a form with no welcome image starts when the browser is idle. Images are fetched one at a time so they never slow down what the respondent is doing, up to 12 per form. Prefetching is skipped when the respondent's browser asks to save data or when a response is already submitted, and it stops on a very slow connection rather than competing with the form.
