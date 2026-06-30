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
import { BUILDER_CONTROL_STYLES } from './builder-styles';
import {
  DistributionService,
  type CreateDistributionInput,
  type DistributionChannel,
} from './distribution.service';
import { textToQrSvg } from './qr-code';

const DISTRIBUTION_CSS = /* css */ `
.dm { display: flex; flex-direction: column; gap: 16px; }
.dm-create { display: grid; grid-template-columns: 1fr 160px auto; gap: 10px; align-items: end; }
.dm-list { display: flex; flex-direction: column; gap: 12px; }
.dm-card { border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-lg, 12px); padding: 14px 16px; background: var(--mj-bg-surface-card, var(--mj-bg-surface)); }
.dm-card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dm-card-name { font-weight: 700; color: var(--mj-text-primary); }
.dm-card-body { margin-top: 10px; display: flex; gap: 16px; flex-wrap: wrap; }
.dm-artifact { flex: 1 1 280px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.dm-code { display: flex; gap: 6px; align-items: stretch; }
.dm-code code { flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; font-size: 0.8125rem; padding: 8px 10px; border-radius: var(--mj-radius-md, 8px); background: var(--mj-bg-surface-sunken); border: 1px solid var(--mj-border-subtle); color: var(--mj-text-primary); }
.dm-copy { flex: none; }
.dm-qr { width: 132px; height: 132px; border: 1px solid var(--mj-border-subtle); border-radius: var(--mj-radius-md, 8px); padding: 6px; background: var(--mj-bg-surface); }
.dm-qr svg { width: 100%; height: 100%; display: block; }
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
  styles: [BUILDER_CONTROL_STYLES, DISTRIBUTION_CSS],
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
    return this.service.publicUrl(dist.Slug ?? '', this.effectiveBaseUrl);
  }

  protected embedSnippet(dist: mjBizAppsFormsFormDistributionEntity): string {
    return this.service.embedSnippet(dist.Slug ?? '', this.effectiveBaseUrl);
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

  private get effectiveBaseUrl(): string {
    if (this.publicBaseUrl.length > 0) {
      return this.publicBaseUrl;
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
}
