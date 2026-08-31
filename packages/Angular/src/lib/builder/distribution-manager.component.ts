import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import type { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { LogError } from '@memberjunction/core';

import { FORMS_UI_CSS } from '../shared';
import { DISTRIBUTION_STYLES } from './distribution-manager.styles';
import { DistributionService, type MutationOutcome } from './distribution.service';
import { fromLocalInputValue, toLocalInputValue } from './local-datetime';
import { resolveApiOrigin } from '../shared/mj-api-origin';
import { textToQrSvg } from './qr-code';
import { readResponseLimit } from './response-limit';
import { autoShareName, shareState, type ShareState } from './share-state';

/** The three renderings of one link. Not three kinds of link — see the class comment. */
type ShareView = 'link' | 'qr' | 'embed';

/** Which artifact the "Copied" confirmation is currently attached to. */
type CopyTarget = 'link' | 'embed';

/** How long the copy button stays in its confirmed state, in ms. */
const COPY_FEEDBACK_MS = 2000;

/**
 * The Distribute tab: get a link to this form, and control who can still use it.
 *
 * THE THING THIS FIXES. The old version made you choose a "channel" — PublicLink, Embed or
 * QR — before you could create anything, and then showed you only the artifact matching
 * that choice. That choice was fiction. Every distribution has a link; a QR is that link
 * drawn as a square and an embed is that link in an iframe. Nothing downstream reads the
 * column except the server's minting allow-list, where all three behave identically. So
 * the UI invented a decision the domain does not have, forced it at the worst possible
 * moment (before you had seen a single artifact), made it permanent (nothing could edit
 * `ChannelType`), and punished getting it wrong by making you create a SECOND link with a
 * different URL to get a QR of the first. The junk half-named records this tab accumulates
 * are the fossil record of people discovering that.
 *
 * Now: one link, three ways to use it, all always available. Creating one asks nothing.
 *
 * THE OTHER THING THIS FIXES. The badge showed `Status` verbatim, so a link sitting at its
 * response cap read "Active" while the server refused every submission. {@link shareState}
 * computes the effective answer from the same facts the server gates on.
 *
 * WHAT IS DELIBERATELY QUIET. Exactly one filled button exists on the share surface —
 * Copy. Pausing, downloading, opening in a tab and deleting are all ghost or quiet, in
 * roughly the order people need them. The previous layout made Open/Close the loudest
 * control on every card, which is backwards: nobody arrives at this tab wanting to close
 * something.
 */
@Component({
  selector: 'mjf-distribution-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  providers: [DistributionService],
  templateUrl: './distribution-manager.component.html',
  styles: [FORMS_UI_CSS, DISTRIBUTION_STYLES],
})
export class DistributionManagerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) formId!: string;
  /** Public base URL where the respondent widget is hosted (slug appended as /f/:slug). */
  @Input() publicBaseUrl = '';

  private readonly service = inject(DistributionService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);

  protected links: mjBizAppsFormsFormDistributionEntity[] = [];
  protected loading = true;
  /** A failed LOAD, which is not the same as having no links — the empty state would lie. */
  protected loadError: string | null = null;
  /** A failed WRITE, shown against the selected link. */
  protected actionError: string | null = null;
  protected busy = false;

  protected selectedId: string | null = null;
  protected view: ShareView = 'link';
  protected copied: CopyTarget | null = null;

  protected renaming = false;
  protected nameDraft = '';
  protected confirmingDelete = false;
  protected confirmingReissue = false;

  /**
   * Focus and pre-select the rename box the moment it exists.
   *
   * A ViewChild SETTER rather than a lifecycle hook: it fires exactly when the query
   * result changes, which is when `@if (renaming)` puts the input in the DOM — no timer
   * racing the render, and nothing running on every check. Selecting the text matters as
   * much as focusing it, because the name being replaced is usually the generated
   * placeholder, and typing over it should not start with a manual select-all.
   */
  @ViewChild('nameBox')
  protected set nameBox(ref: ElementRef<HTMLInputElement> | undefined) {
    ref?.nativeElement.select();
  }

  private copyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly qrCache = new Map<string, SafeHtml>();

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  ngOnDestroy(): void {
    if (this.copyTimer !== null) {
      clearTimeout(this.copyTimer);
    }
  }

  // ------------------------------------------------------------------ loading

  /**
   * Re-read the links.
   *
   * `quiet` re-reads WITHOUT raising `loading`, which the template turns into a full-pane
   * "Loading share links…" that unmounts the two-pane shell. Right for the first load and wrong
   * after a credential write: those happen on the Settings switch below the fold, so blanking the
   * pane threw the author's scroll position away and dropped keyboard focus to `<body>` — on every
   * pause and every reopen — leaving the switch they had just pressed unreachable without tabbing
   * from the top of the document. The data still refreshes; only the announcement is suppressed.
   */
  protected async reload(quiet = false): Promise<void> {
    this.loading = !quiet;
    this.loadError = null;
    this.cdr.markForCheck();

    const result = await this.service.list(this.formId);
    this.loading = false;
    if (!result.ok) {
      this.loadError = result.error;
      this.cdr.markForCheck();
      return;
    }
    this.links = result.items;
    this.qrCache.clear();
    // Keep the author where they were across a reload; fall back to the newest link.
    if (!this.links.some((l) => l.ID === this.selectedId)) {
      this.selectLink(this.links[0]?.ID ?? null);
    }
    this.cdr.markForCheck();
  }

  /**
   * Move the selection, dropping every confirmation armed against the link being left.
   *
   * The one place `selectedId` is assigned, because a confirmation is armed against a RECORD and
   * the flags holding it are not. `select()` cleared them; creating a link, deleting one, and a
   * reload whose selected row is gone all reassigned `selectedId` without doing so — so an armed
   * "Replace it" survived onto whatever was selected next, and one click then rotated the token
   * of a link the author never armed. Making assignment and reset the same act is what stops the
   * next new path reintroducing it.
   */
  private selectLink(id: string | null): void {
    this.selectedId = id;
    this.confirmingDelete = false;
    this.confirmingReissue = false;
  }

  protected get selected(): mjBizAppsFormsFormDistributionEntity | null {
    return this.links.find((l) => l.ID === this.selectedId) ?? null;
  }

  protected select(link: mjBizAppsFormsFormDistributionEntity): void {
    this.selectLink(link.ID);
    this.cancelRename();
    this.actionError = null;
  }

  // ----------------------------------------------------------------- creating

  /**
   * Create a share link and show it. No name, no channel, no dialog.
   *
   * The old flow disabled Create until you typed a name, which put a blank text field
   * between a person and the only thing this tab produces. A generated placeholder name
   * that is one click from being changed costs nothing and blocks nobody.
   */
  protected async create(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.actionError = null;
    this.cdr.markForCheck();

    const created = await this.service.create({
      formId: this.formId,
      name: autoShareName(this.links.map((l) => l.Name)),
    });
    this.busy = false;
    if (!created) {
      this.actionError = 'Could not create a share link. Check the console for details.';
      this.cdr.markForCheck();
      return;
    }
    await this.reload();
    this.selectLink(created.ID);
    this.view = 'link';
    this.cdr.markForCheck();
  }

  // -------------------------------------------------------------------- state

  /** The effective state of a link — what a respondent opening it right now would get. */
  protected stateOf(link: mjBizAppsFormsFormDistributionEntity): ShareState {
    return shareState(link, new Date());
  }

  /** `.mjf-badge` modifier for a state, or the bare badge for the neutral tone. */
  protected badgeClass(state: ShareState): string {
    return state.tone === 'neutral' ? 'mjf-badge' : `mjf-badge mjf-badge--${state.tone}`;
  }

  /** Matching dot for the rail. Decorative — the rail prints the state in words too. */
  protected dotClass(state: ShareState): string {
    return state.tone === 'neutral' ? 'dm-dot' : `dm-dot dm-dot--${state.tone}`;
  }

  /** How full a capped link is, 0–100. Zero when there is no cap to be full of. */
  protected capPercent(link: mjBizAppsFormsFormDistributionEntity): number {
    const cap = link.MaxResponses;
    if (cap === null || cap <= 0) {
      return cap === 0 ? 100 : 0;
    }
    return Math.min(100, Math.round((link.ResponseCount / cap) * 100));
  }

  /**
   * Do whatever the current state's `fix` promises.
   *
   * One handler rather than five buttons: the state already decides which remedy is on
   * offer, so the alternative is five conditionals in the template each duplicating that
   * decision. `pending` and `paused` both go through {@link runCredentialWrite}, because
   * both ask the server to mint a token and that is written by a second server-side save
   * this client's copy of the record knows nothing about.
   */
  protected async applyFix(): Promise<void> {
    const link = this.selected;
    if (!link || this.busy) {
      return;
    }
    const kind = this.stateOf(link).kind;
    switch (kind) {
      case 'pending':
        await this.runCredentialWrite(() => this.service.issueLink(link));
        this.warnIfStillUnissued(link.ID, 'issue');
        return;
      case 'paused':
        // Warns for the same reason `pending` does: reopening asks the server to mint, and the
        // hook is fail-soft, so "turned it back on and got no web address" is a real outcome the
        // author would otherwise have to notice from the badge alone.
        await this.runCredentialWrite(() => this.service.open(link));
        this.warnIfStillUnissued(link.ID, 'issue');
        return;
      case 'ended':
        await this.run(() => this.service.setSchedule(link, link.OpenAt, null));
        return;
      case 'scheduled':
        await this.run(() => this.service.setSchedule(link, null, link.CloseAt));
        return;
      case 'full':
        await this.run(() => this.service.setMaxResponses(link, null));
        return;
      case 'live':
        return;
    }
  }

  // ----------------------------------------------------------------- mutations

  protected async toggleOpen(): Promise<void> {
    const link = this.selected;
    if (!link || this.busy) {
      return;
    }
    const reopening = link.Status !== 'Active';
    await this.runCredentialWrite(() =>
      reopening ? this.service.open(link) : this.service.close(link),
    );
  }

  /**
   * Ask the server for a new access token, keeping the web address.
   *
   * Two clicks, because it cannot be undone: the previous token stops working the instant
   * this lands, and anyone holding it (a scraped `PublicLinkToken`, a copied redeem URL)
   * loses access. What it does NOT break is the shared link itself — `/f/:slug` looks the
   * token up at request time, so posters, QR codes and embeds carry on working. That is
   * the whole reason this exists instead of "delete it and make another".
   */
  protected async confirmReissue(): Promise<void> {
    const link = this.selected;
    if (!link || this.busy) {
      return;
    }
    this.confirmingReissue = false;
    await this.runCredentialWrite(() => this.service.reissueLink(link));
    this.warnIfStillUnissued(link.ID, 'reissue');
  }

  /**
   * Say so when a write that was supposed to produce a token did not — and be exact about which
   * of the two failures it was, because for a reissue they are opposites.
   *
   * The service reports whether the SAVE succeeded; the hook that mints is deliberately
   * fail-soft, so a green save and a link with no web address are the same outcome from here.
   * The reloaded record carries the evidence, in the pair of columns the server writes together:
   *
   *  - a token          → nothing went wrong.
   *  - no token, no invite → the old credential WAS withdrawn; only the replacement failed.
   *  - no token, invite still linked → the revoke did NOT land. The server leaves it linked
   *    precisely so the next save retries, and that is the state where the leaked token an
   *    author just tried to kill is still redeemable. Saying "the old token was withdrawn"
   *    here — which is what a single message did — is the inverse of the truth, on the one
   *    flow whose entire purpose is killing a leaked credential.
   *
   * Takes the link's ID rather than reading `this.selected`, because the rail stays clickable
   * through the two round-trips: the author can select a different link before this runs, and
   * the warning would then be written under a record it says nothing about.
   */
  private warnIfStillUnissued(linkId: string, wrote: 'issue' | 'reissue'): void {
    const link = this.links.find((l) => l.ID === linkId);
    if (!link || link.PublicLinkToken) {
      return;
    }
    if (link.MagicLinkInviteID) {
      this.actionError =
        'The server could not withdraw this link\'s old access token, so it may still work. ' +
        'This link has no working web address in the meantime. Try again, and if it keeps ' +
        'failing someone technical needs to look at the server log.';
    } else if (wrote === 'reissue') {
      this.actionError =
        'The old token was withdrawn, but the server did not issue a new one, so this link is ' +
        'not working. Use "Issue the link" to try again.';
    } else {
      this.actionError =
        'The server did not hand out a web address for this link. Public links are not switched on for this server — someone technical needs to enable magic links before any share link here will work.';
    }
    this.cdr.markForCheck();
  }

  /**
   * Apply a typed response limit, and leave the box showing what is actually stored.
   *
   * Takes the element rather than its value because both outcomes need to write back to
   * it. Angular repaints `[value]` only when the BOUND expression changes, so a refused
   * entry — or one clamped to a number the record already held — would sit in the box
   * looking accepted while the database held something else. Setting it by hand after
   * every path is what keeps displayed and stored the same thing.
   */
  protected async setMax(box: HTMLInputElement): Promise<void> {
    const link = this.selected;
    if (!link || this.busy) {
      return;
    }
    const edit = readResponseLimit(box.value, box.validity.badInput);
    if (edit.action === 'ignore') {
      this.actionError = edit.reason;
      this.showStoredLimit(box, link);
      return;
    }
    await this.run(() =>
      this.service.setMaxResponses(link, edit.action === 'clear' ? null : edit.value),
    );
    this.showStoredLimit(box, link);
  }

  private showStoredLimit(box: HTMLInputElement, link: mjBizAppsFormsFormDistributionEntity): void {
    box.value = link.MaxResponses === null ? '' : String(link.MaxResponses);
    this.cdr.markForCheck();
  }

  /** The expiry. There is no start-date setter: the UI offers only this half — see the
   *  template's note on why, and `applyFix` for how a start date set elsewhere is cleared. */
  protected async setCloseAt(raw: string): Promise<void> {
    const link = this.selected;
    if (!link || this.busy) {
      return;
    }
    await this.run(() => this.service.setSchedule(link, link.OpenAt, fromLocalInputValue(raw)));
  }

  /**
   * Run one write, keeping `busy` and `actionError` honest on every path.
   *
   * The entity is mutated in place by the service, so a successful write needs no reload —
   * which is what keeps selection, scroll position and the open panel where they were.
   */
  private async run(write: () => Promise<MutationOutcome>): Promise<void> {
    this.busy = true;
    this.actionError = null;
    this.cdr.markForCheck();
    try {
      const outcome = await write();
      this.actionError = outcome.ok ? null : (outcome.error ?? 'That did not save.');
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Run one write that changes this link's access token, then re-read the record.
   *
   * The reload is not optional here, and is what separates these writes from the others.
   * Pausing, reopening, issuing and reissuing all make the server's lifecycle hook write
   * `MagicLinkInviteID` / `PublicLinkToken` in a SECOND save that this client's copy of
   * the record never sees. Skipping the re-read leaves the screen rendering a token that
   * has been revoked, or none where one was just minted — which the badge reads as "Not
   * ready" on a link that is live.
   */
  private async runCredentialWrite(write: () => Promise<MutationOutcome>): Promise<void> {
    await this.run(write);
    await this.reload(true);
  }

  // -------------------------------------------------------------------- rename

  protected startRename(): void {
    const link = this.selected;
    if (!link) {
      return;
    }
    this.nameDraft = link.Name;
    this.renaming = true;
    this.cdr.markForCheck();
  }

  protected cancelRename(): void {
    this.renaming = false;
    this.cdr.markForCheck();
  }

  /** Commit a rename. A blank name is treated as a cancel, never saved as an empty title. */
  protected async commitName(): Promise<void> {
    const link = this.selected;
    const name = this.nameDraft.trim();
    this.renaming = false;
    if (!link || name.length === 0 || name === link.Name) {
      this.cdr.markForCheck();
      return;
    }
    await this.run(() => this.service.setName(link, name));
  }

  // -------------------------------------------------------------------- delete

  /**
   * Whether deleting is offered at all.
   *
   * A link with responses stays undeletable: `FormUpload.DistributionID` is a required FK
   * so the database would refuse anyway, and the record is the only thing explaining where
   * those responses came from. Pausing does the job people actually want here — it stops
   * responses without breaking a URL that may be printed on something.
   */
  protected get canDelete(): boolean {
    const link = this.selected;
    return link !== null && link.ResponseCount === 0;
  }

  protected async confirmDelete(): Promise<void> {
    const link = this.selected;
    if (!link || this.busy) {
      return;
    }
    this.busy = true;
    this.actionError = null;
    this.cdr.markForCheck();

    const outcome = await this.service.remove(link);
    this.busy = false;
    this.confirmingDelete = false;
    if (!outcome.ok) {
      this.actionError = `Could not delete this share link. ${outcome.error ?? ''}`.trim();
      this.cdr.markForCheck();
      return;
    }
    this.links = this.links.filter((l) => l.ID !== link.ID);
    this.selectLink(this.links[0]?.ID ?? null);
    this.cdr.markForCheck();
  }

  // ------------------------------------------------------------------ artifacts

  protected publicUrl(link: mjBizAppsFormsFormDistributionEntity): string {
    return this.service.publicUrl(link, this.effectiveBaseUrl);
  }

  protected embedSnippet(link: mjBizAppsFormsFormDistributionEntity): string {
    return this.service.embedSnippet(link, this.effectiveBaseUrl);
  }

  /** Render the QR for a link's public URL; returns null if encoding fails. */
  protected qrSvg(link: mjBizAppsFormsFormDistributionEntity): SafeHtml | null {
    const url = this.publicUrl(link);
    const cached = this.qrCache.get(url);
    if (cached) {
      return cached;
    }
    try {
      const svg = this.sanitizer.bypassSecurityTrustHtml(textToQrSvg(url));
      this.qrCache.set(url, svg);
      return svg;
    } catch (err) {
      LogError(`Could not build a QR for distribution ${link.ID}: ${String(err)}`);
      return null;
    }
  }

  /**
   * Download a link's QR.
   *
   * SVG rather than a raster: a QR goes on a poster or a slide, and vector prints crisply
   * at any size where a fixed-pixel PNG does not. The file is self-contained — the
   * `--mjf-qr-*` fallbacks resolve to literal colours once it is outside the app — so it
   * opens correctly in any viewer or design tool.
   */
  protected downloadQr(link: mjBizAppsFormsFormDistributionEntity): void {
    let svg: string;
    try {
      svg = textToQrSvg(this.publicUrl(link));
    } catch (err) {
      LogError(`Could not build a QR for distribution ${link.ID}: ${String(err)}`);
      this.actionError = 'Could not build a QR code for this link.';
      this.cdr.markForCheck();
      return;
    }
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${link.Slug || 'form'}-qr.svg`;
    a.click();
    // Revoking immediately can race the download in some browsers; one turn is enough.
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  /**
   * Whether this link points at the machine the builder is running on.
   *
   * Worth saying out loud in the QR panel specifically. "localhost" means "the device
   * reading this", so a phone scanning a localhost QR dials itself, finds nothing, and
   * shows a connection error — which reads as a broken QR code rather than as the address
   * being unreachable. Nothing is wrong with the code, and nothing needs fixing before
   * release: the URL is built from the configured API origin, so it becomes a real domain
   * the moment this is deployed and the warning disappears on its own.
   */
  protected isLocalOnly(link: mjBizAppsFormsFormDistributionEntity): boolean {
    const url = this.publicUrl(link);
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
  }

  /** The value a `datetime-local` input should show for a stored instant. */
  protected asInputValue(value: Date | string | null): string {
    return toLocalInputValue(value);
  }

  // ---------------------------------------------------------------------- copy

  /**
   * Copy, and SAY so.
   *
   * The old copy button wrote to the clipboard and changed nothing on screen, which is
   * indistinguishable from a button that does not work — so people click it again, and
   * still get nothing. The confirmation is the entire interaction's feedback loop.
   */
  protected async copy(target: CopyTarget, text: string): Promise<void> {
    if (!navigator.clipboard) {
      this.actionError = 'This browser will not let the page copy for you — select the text instead.';
      this.cdr.markForCheck();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      LogError(`Clipboard write was refused: ${String(err)}`);
      this.actionError = 'Copying was blocked — select the text and copy it instead.';
      this.cdr.markForCheck();
      return;
    }
    this.copied = target;
    this.cdr.markForCheck();
    if (this.copyTimer !== null) {
      clearTimeout(this.copyTimer);
    }
    this.copyTimer = setTimeout(() => {
      this.copied = null;
      this.copyTimer = null;
      this.cdr.markForCheck();
    }, COPY_FEEDBACK_MS);
  }

  /** Select the whole URL on focus, so keyboard copying is one shortcut rather than a drag. */
  protected selectAll(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.select();
    }
  }

  /**
   * Base URL the public `/f/:slug` link is built against. This MUST be the **MJAPI
   * origin** (where the anonymous respondent host page is served) — NOT the Explorer
   * origin this builder runs under. Using `window.location.origin` here was the bug
   * that produced `http://localhost:4321/f/:slug` (Explorer → login page) instead of
   * `http://localhost:4121/f/:slug` (the shell-free respondent host).
   *
   * Resolution order: an explicit `publicBaseUrl` input → the configured GraphQL API
   * origin ({@link resolveApiOrigin}) → `window.location.origin` as a last resort.
   */
  private get effectiveBaseUrl(): string {
    if (this.publicBaseUrl.length > 0) {
      return this.publicBaseUrl;
    }
    const apiOrigin = resolveApiOrigin();
    if (apiOrigin) {
      return apiOrigin;
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
}
