import { Component } from '@angular/core';
import { mjBizAppsFormsFormUploadEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Uploads') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformupload-form',
    templateUrl: './mjbizappsformsformupload.form.component.html'
})
export class mjBizAppsFormsFormUploadFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormUploadEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'fileDetails', sectionName: 'File Details', isExpanded: true },
            { sectionKey: 'provenanceAndContext', sectionName: 'Provenance and Context', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

