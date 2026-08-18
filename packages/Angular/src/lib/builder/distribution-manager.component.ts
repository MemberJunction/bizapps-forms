import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import type { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { LogError } from '@memberjunction/core';
import { FORMS_UI_CSS } from '../shared';
import {
  DistributionService,
  type CreateDistributionInput,
  type DistributionChannel,
} from './distribution.service';
import { textToQrSvg } from './qr-code';

const DISTRIBUTION_CSS = /* css */ `
.dm { display: flex; flex-direction: column; gap: var(--mjf-stack); }

.dm-create-panel {
  display: flex;
  flex-direction: column;
  gap: var(--mjf-gap);
  padding: var(--mjf-card-pad);
  border: 1px solid var(--mj-border-subtle);
  border-radius: var(--mjf-radius);
  background: var(--mj-bg-surface);
}
.dm-lede { margin: 0; font-size: var(--mjf-meta); line-height: 1.55; color: var(--mj-text-secondary); }
.dm-create { display: grid; grid-template-columns: minmax(0, 1fr) 170px auto; gap: var(--mjf-gap-sm); align-items: end; }
.dm-hint {
  display: flex;
  align-items: flex-start;
  gap: var(--mjf-gap-sm);
  margin: 0;
  font-size: var(--mjf-label);
  line-height: 1.5;
  color: var(--mj-text-muted);
}
.dm-hint i { margin-top: 2px; }

@media (max-width: 640px) {
  .dm-create { grid-template-columns: 1fr; }
}
.dm-list { display: flex; flex-direction: column; gap: 12px; }
.dm-card { border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-lg, 12px); padding: 14px 16px; background: var(--mj-bg-surface-card, var(--mj-bg-surface)); }
.dm-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dm-card-name { font-weight: 700; color: var(--mj-text-primary); }
.dm-card-body { margin-top: 10px; display: flex; gap: 16px; flex-wrap: wrap; }
.dm-artifact { flex: 1 1 280px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.dm-code { display: flex; gap: 6px; align-items: stretch; }
.dm-code code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; font-size: 0.8125rem; padding: 8px 10px; border-radius: var(--mj-radius-md, 8px); background: var(--mj-bg-surface-sunken); border: 1px solid var(--mj-border-subtle); color: var(--mj-text-primary); }
.dm-copy { flex: none; }
/* The QR plate is deliberately NOT theme-reactive: a QR is dark-on-light by spec, and
   inverting it in dark mode produces a code many scanners reject. These two are the only
   fixed colours in the file and they are token definitions, which is the sanctioned place
   for a literal. */
.dm-qr {
  --mjf-qr-dark: #111111;
  --mjf-qr-light: #ffffff;
}
.dm-qr { flex: none; width: 132px; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.dm-qr-plate { width: 132px; height: 132px; padding: 6px; box-sizing: border-box; border: 1px solid var(--mj-border-subtle); border-radius: var(--mjf-radius-sm); background: var(--mj-bg-surface); }
.dm-qr svg { width: 100%; height: 100%; display: block; }
.dm-qr-download { width: 100%; }
.dm-qr-missing { flex: 1 1 200px; margin: 0; font-size: var(--mjf-label); color: var(--mj-text-muted); }
.dm-meta { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 0.8125rem; color: var(--mj-text-secondary); align-items: center; }
.dm-actions { display: flex; gap: 8px; margin-top: 10px; }
.dm-status { font-weight: 700; }
.dm-status--active { color: var(--mj-status-success, var(--mj-color-success-600)); }
.dm-status--closed { color: var(--mj-status-error, var(--mj-color-error-600)); }
.dm-status--draft { color: var(--mj-text-muted); }
.dm-empty { font-size: 0.875rem; color: var(--mj-text-muted); }
.dm-num { width: 90px; }
`;

/**
 * FormDistribution management surface: create distributions (PublicLink / Embed /
 * QR), list them, and show the shareable artifacts — public URL, `<iframe>` embed
 * snippet, and a scannable QR. Open/close the response window and cap MaxResponses.
 */
@Component({
  selector: 'mjf-distribution-manager',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  providers: [DistributionService],
  templateUrl: './distribution-manager.component.html',
  styles: [FORMS_UI_CSS, DISTRIBUTION_CSS],
})
export class DistributionManagerComponent implements OnInit {
  @Input({ required: true }) formId!: string;
  /** Public base URL where the respondent widget is hosted (slug appended as /f/:slug). */
  @Input() publicBaseUrl = '';

  private readonly service = inject(DistributionService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);

  protected distributions: mjBizAppsFormsFormDistributionEntity[] = [];
  protected loading = true;
  protected creating = false;

  protected newName = '';
  protected newChannel: DistributionChannel = 'PublicLink';
  protected readonly channels: DistributionChannel[] = ['PublicLink', 'Embed', 'QR'];

  /**
   * What each channel actually produces, shown under the picker.
   *
   * Choosing a channel on its own does nothing visible — the artifact (QR image, embed
   * snippet) only exists once a distribution record is created — so without this the tab
   * reads as broken: you pick "QR", nothing happens, and the Create button next to it is
   * disabled because the name is empty, with nothing saying so.
   */
  protected readonly channelHelp: Record<DistributionChannel, string> = {
    PublicLink: 'A shareable URL people open in a browser. Create it to get the link.',
    Embed: 'A public link plus a copy-paste <mj-form> snippet for your own site.',
    QR: 'A public link plus a downloadable QR code image for print or slides.',
    // Not in `channels` above, so this line is never shown today. It is here because the
    // map is typed total over DistributionChannel: offering Email later must be a one-line
    // change to `channels`, not a silently-missing hint.
    Email: 'A public link intended for an email campaign, tracked separately from the rest.',
  };

  /** The help line for the channel currently selected in the picker. */
  protected get channelHint(): string {
    return this.channelHelp[this.newChannel];
  }

  /**
   * Why Create is unavailable, or null when it is available.
   *
   * Returned as a sentence rather than left implicit: a disabled button with no
   * explanation is indistinguishable from a broken one.
   */
  protected get createBlockedReason(): string | null {
    if (this.creating) return 'Creating…';
    if (this.newName.trim().length === 0) return 'Give this distribution a name first.';
    return null;
  }

  private readonly qrCache = new Map<string, SafeHtml>();

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading = true;
    this.distributions = await this.service.list(this.formId);
    this.qrCache.clear();
    this.loading = false;
    this.cdr.markForCheck();
  }

  protected async create(): Promise<void> {
    const name = this.newName.trim();
    if (name.length === 0 || this.creating) {
      return;
    }
    this.creating = true;
    const input: CreateDistributionInput = {
      formId: this.formId,
      name,
      channelType: this.newChannel,
    };
    const created = await this.service.create(input);
    this.creating = false;
    if (created) {
      this.newName = '';
      await this.reload();
    }
  }

  protected async toggleOpen(dist: mjBizAppsFormsFormDistributionEntity): Promise<void> {
    const ok =
      dist.Status === 'Active' ? await this.service.close(dist) : await this.service.open(dist);
    if (ok) {
      this.cdr.markForCheck();
    }
  }

  protected async setMax(
    dist: mjBizAppsFormsFormDistributionEntity,
    raw: string,
  ): Promise<void> {
    const value = raw.trim() === '' ? null : Number(raw);
    const next = value === null || Number.isNaN(value) ? null : value;
    await this.service.setMaxResponses(dist, next);
    this.cdr.markForCheck();
  }

  protected publicUrl(dist: mjBizAppsFormsFormDistributionEntity): string {
    return this.service.publicUrl(dist, this.effectiveBaseUrl);
  }

  protected embedSnippet(dist: mjBizAppsFormsFormDistributionEntity): string {
    return this.service.embedSnippet(dist, this.effectiveBaseUrl);
  }

  /** Render the QR for a distribution's public URL; returns null if encoding fails. */
  protected qrSvg(dist: mjBizAppsFormsFormDistributionEntity): SafeHtml | null {
    const url = this.publicUrl(dist);
    const cached = this.qrCache.get(url);
    if (cached) {
      return cached;
    }
    try {
      const svg = this.sanitizer.bypassSecurityTrustHtml(textToQrSvg(url));
      this.qrCache.set(url, svg);
      return svg;
    } catch {
      return null;
    }
  }

  /**
   * Download a distribution's QR.
   *
   * SVG rather than a raster: a QR goes on a poster or a slide, and vector prints crisply
   * at any size where a fixed-pixel PNG does not. The file is self-contained — the
   * `--mjf-qr-*` fallbacks resolve to literal colours once it is outside the app — so it
   * opens correctly in any viewer or design tool.
   */
  protected downloadQr(dist: mjBizAppsFormsFormDistributionEntity): void {
    let svg: string;
    try {
      svg = textToQrSvg(this.publicUrl(dist));
    } catch (err) {
      LogError(`Could not build a QR for distribution ${dist.ID}: ${String(err)}`);
      return;
    }
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${dist.Slug || 'form'}-qr.svg`;
    a.click();
    // Revoking immediately can race the download in some browsers; one turn is enough.
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  protected async copy(text: string): Promise<void> {
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard may be blocked; the value is visible for manual copy.
      }
    }
  }

  protected statusClass(dist: mjBizAppsFormsFormDistributionEntity): string {
    return `dm-status dm-status--${dist.Status.toLowerCase()}`;
  }

  /**
   * Base URL the public `/f/:slug` link is built against. This MUST be the **MJAPI
   * origin** (where the anonymous respondent host page is served) — NOT the Explorer
   * origin this builder runs under. Using `window.location.origin` here was the bug
   * that produced `http://localhost:4321/f/:slug` (Explorer → login page) instead of
   * `http://localhost:4121/f/:slug` (the shell-free respondent host).
   *
   * Resolution order: an explicit `publicBaseUrl` input → the configured GraphQL API
   * origin (`GraphQLDataProvider.Instance.ConfigData.URL`) → `window.location.origin`
   * as a last resort.
   */
  private get effectiveBaseUrl(): string {
    if (this.publicBaseUrl.length > 0) {
      return this.publicBaseUrl;
    }
    const apiOrigin = this.resolveApiOrigin();
    if (apiOrigin) {
      return apiOrigin;
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  }

  /** Origin of the configured MJAPI GraphQL endpoint, or '' if unavailable. */
  private resolveApiOrigin(): string {
    try {
      const url = GraphQLDataProvider.Instance?.ConfigData?.URL;
      return url ? new URL(url).origin : '';
    } catch {
      return '';
    }
  }
}
