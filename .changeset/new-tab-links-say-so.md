---
'@mj-biz-apps/forms-entities': patch
'@mj-biz-apps/forms-actions': patch
'@mj-biz-apps/forms-server': patch
'@mj-biz-apps/forms-ng': patch
'@mj-biz-apps/forms-core-entities-server': patch
---

Links that open a new tab now say so

Two of them did not. **Open it yourself**, on a share link in the Distribute tab, and the social
links on an ending screen both leave the page, and the only cue either gave was an icon marked
decorative — so a screen-reader user left the builder, or left the form mid-submission, with no
warning at all. Both now carry the same "(opens in a new tab)" cue the five help-centre links
already had, and a test holds every such link in the package to it rather than leaving the next
one to be caught by eye.
