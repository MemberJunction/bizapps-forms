---
"@mj-biz-apps/forms-ng": patch
---

`@angular/cdk` is a compatibility claim again, so Forms installs on a host that is not on exactly 21.1.3.

`forms-ng` declared `"@angular/cdk": "21.1.3"` in `peerDependencies` — exact, the only exact `@angular/*` peer in the repo, sitting next to five caret ranges. The CDK version line moves independently of `@angular/core`, so a stock MJ `6.1.0-edge.6` host is on `@angular/cdk@21.2.14` through no fault of its own. npm refuses the tree with `ERESOLVE`, and `mj app install` finishes its database work — schema created, all migrations applied, app recorded — and then finalizes Forms as **Disabled**, telling the operator to log in to npm or fix their `.npmrc`. Neither was ever involved.

**This is not a regression the release introduces.** Every published version from `0.5.0` through `0.10.0` carries the same exact peer, so any host that has installed Forms on a 6.1 line newer than CDK 21.1.3 is sitting at `Disabled` right now, and was told the cause was npm auth. `mj app upgrade` reproduces it on an existing installation: a host that went into the upgrade `Active` comes out `Disabled`, exit code 0, `✔ Successfully upgraded` printed — so an unattended operator gets no signal at all.

**The blast radius reached past Forms.** The only way past the `ERESOLVE` is `npm install --legacy-peer-deps`, and that flag disables npm's peer auto-install for the entire tree. A sibling app's required peers then silently fail to install, and it surfaces much later as a bare module-resolution error in the Explorer naming a package nobody was looking at. One exact peer in Forms could take a host's Explorer down through an app Forms does not ship.

**If your Forms app is `Disabled` today**, upgrading is not enough on its own — the upgrade does not clear the status it found. Re-run `npm install` in the host directory (it will now succeed without flags), then `mj app enable mj-bizapps-forms`. `docs/install.md` §7 has the full recovery, including how to tell this apart from a genuine npm auth failure.

A CI gate now reads every `peerDependencies` block and refuses an exact version, because nothing in this repo could see one before: it is a string only the host's resolver evaluates, the pnpm workspace never evaluates it, and no unit test can reach it — which is how it shipped six times.
