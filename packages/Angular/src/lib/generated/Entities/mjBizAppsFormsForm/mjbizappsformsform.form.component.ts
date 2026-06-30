import { Component } from '@angular/core';
import { mjBizAppsFormsFormEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Forms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsform-form',
    templateUrl: './mjbizappsformsform.form.component.html'
})
export class mjBizAppsFormsFormFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formInformation', sectionName: 'Form Information', isExpanded: true },
            { sectionKey: 'presentationSettings', sectionName: 'Presentation & Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormDistributions', sectionName: 'Form Distributions', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormVersions', sectionName: 'Form Versions', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormQuestions', sectionName: 'Form Questions', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormPages', sectionName: 'Form Pages', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormResponses', sectionName: 'Form Responses', isExpanded: false }
        ]);
    }
}

