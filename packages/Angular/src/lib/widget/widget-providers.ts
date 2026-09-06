/**
 * The DI providers `<mj-form>` needs, in one place.
 *
 * There are two hosts for the widget and they are easy to forget about separately: the
 * `<mj-form>` custom element (`register-element.ts`, which bootstraps its own Angular
 * application) and the builder's Preview modal (which renders the same component inside
 * the Explorer). The modal used to hand-roll a subset of this list, and the omissions did
 * not show up as a build error — they showed up as `NG0201: No provider found` the moment
 * an author pressed Preview, one missing token at a time. Preview was dead in the Explorer
 * for exactly that reason.
 *
 * Anything `MjFormComponent` or its children inject belongs here, so adding a dependency
 * is one edit and both hosts get it.
 */
import type { Provider } from '@angular/core';

import { FORMS_API_CONFIG, type FormsApiConfig } from './api/forms-api.config';
import { FORMS_API_SERVICE } from './api/forms-api.interface';
import { FormsGraphQLApiService } from './api/forms-api.graphql.service';
import { FormsMockApiService } from './api/forms-api.mock.service';
import { FormUploadService } from './api/form-upload.service';
import { FORMS_UPLOAD_SERVICE } from './api/form-upload.interface';
import { FormsMockUploadService } from './api/form-upload.mock.service';

/**
 * Providers for one `<mj-form>` host.
 *
 * Both transports are chosen from the config rather than passed in: a config with no
 * `graphqlUrl` has nowhere to send a submission OR a file, so the mocks are the only
 * correct choice and callers cannot get the pairing wrong. That is what makes this safe
 * for the preview, which passes an empty config precisely so a trial submission writes
 * nothing.
 *
 * Read and upload are deliberately branched on the SAME expression. They were once
 * branched on nothing at all — the uploader was bound unconditionally — and the preview
 * answered every drawing with "Uploads are not available for this form.", which also made
 * a required Doodle question impossible to get past. Splitting the condition
 * is how that comes back.
 */
export function formsWidgetProviders(config: FormsApiConfig): Provider[] {
  return [
    { provide: FORMS_API_CONFIG, useValue: config },
    {
      provide: FORMS_API_SERVICE,
      useClass: config.graphqlUrl ? FormsGraphQLApiService : FormsMockApiService,
    },
    {
      provide: FORMS_UPLOAD_SERVICE,
      useClass: config.graphqlUrl ? FormUploadService : FormsMockUploadService,
    },
    FormsGraphQLApiService,
    FormsMockApiService,
    FormUploadService,
    FormsMockUploadService,
  ];
}
