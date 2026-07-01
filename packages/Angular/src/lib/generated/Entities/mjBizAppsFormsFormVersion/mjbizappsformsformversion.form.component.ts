import { Component } from '@angular/core';
import { mjBizAppsFormsFormVersionEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Versions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformversion-form',
    templateUrl: './mjbizappsformsformversion.form.component.html'
})
export class mjBizAppsFormsFormVersionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormVersionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formReference', sectionName: 'Form Reference', isExpanded: true },
            { sectionKey: 'versionDetails', sectionName: 'Version Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormResponses', sectionName: 'Form Responses', isExpanded: false }
        ]);
    }
}

