---
'@mj-biz-apps/forms-ng': patch
---

Published forms now load the images for later screens in the background, so picture-choice options and ending-screen images appear with their screen instead of several seconds after it on a slow mobile connection. Prefetching waits until the welcome image has loaded (the welcome image is also requested at high priority), fetches one image at a time so it never slows down what the respondent is doing, stops after 12 images, and is skipped entirely when the respondent's browser asks to save data.
