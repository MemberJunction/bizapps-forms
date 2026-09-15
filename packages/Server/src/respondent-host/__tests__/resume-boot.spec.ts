import { describe, expect, it } from 'vitest';

import { renderRespondentHostPage } from '../host-page';
import { RESUME_WIDGET_EVENTS, resumeNoticeFor, routeForEvent, startOverRequiresReload } from '../resume-boot';

describe('resumeNoticeFor', () => {
  it.each(['dead-pointer', 'disabled', 'no-pointer', 'rate-limited', 'network', undefined, 'anything-new'])(
    'says the same neutral thing for %s, so it never reveals whether a draft exists',
    (reason) => {
      expect(resumeNoticeFor(reason)).toBe(
        "We couldn't reopen your saved answers on this device. Start fresh, or request a link by email.",
      );
    },
  );

  it('says something DIFFERENT for a double open, because that is not a failure', () => {
    // The respondent already knows the form is open elsewhere — they opened it — so this leaks
    // nothing, and unlike the neutral line it is something they can act on.
    expect(resumeNoticeFor('open-elsewhere')).toBe(
      'This form is already open in another tab. Continue there, or start fresh here.',
    );
  });
});

describe('routeForEvent', () => {
  it('sends a first save to remember, and both endings to forget', () => {
    expect(routeForEvent('mjf-partial-saved')).toBe('remember');
    expect(routeForEvent('mjf-start-over')).toBe('forget');
    expect(routeForEvent('mjf-submitted')).toBe('forget');
  });

  it('ignores every other event on the page', () => {
    expect(routeForEvent('click')).toBeUndefined();
    expect(routeForEvent('mjf-something-else')).toBeUndefined();
  });

  it('enumerates exactly the events the page subscribes to', () => {
    expect([...RESUME_WIDGET_EVENTS].sort()).toEqual(['mjf-partial-saved', 'mjf-start-over', 'mjf-submitted']);
  });
});

describe('startOverRequiresReload', () => {
  it('is true, because a scoped session would UPDATE the row it is walking away from', () => {
    expect(startOverRequiresReload()).toBe(true);
  });
});

describe('the host page and the resume pointer', () => {
  const base = { graphqlUrl: 'https://api.test/graphql', widgetBundleUrl: '/w.js', defaultSlug: 'share-1' };

  it('stamps data-has-draft only when the browser presented a pointer', () => {
    // The stamped ATTRIBUTE, not the name: the boot script reads `data-has-draft` and therefore
    // mentions it either way, so a bare substring check would pass for the wrong reason.
    expect(renderRespondentHostPage({ ...base, hasDraft: true })).toContain('data-has-draft="1"');
    expect(renderRespondentHostPage(base)).not.toContain('data-has-draft="1"');
  });

  it('never puts the cookie, or its name, into the page', () => {
    // The pointer is HttpOnly; the page learns only that one was there. If its name appears here,
    // something has started reading it client-side.
    const html = renderRespondentHostPage({ ...base, hasDraft: true });
    expect(html).not.toContain('mjf_resume');
  });

  it('asks the host to reopen the draft before mounting the widget', () => {
    // A cheap presence check on the boot script: the behaviour it guards is asserted by the route
    // specs, and by `resumeNoticeFor` above.
    const html = renderRespondentHostPage({ ...base, hasDraft: true });
    expect(html).toContain("postHost('resume'");
    expect(html).toContain("credentials: 'same-origin'");
  });
});
