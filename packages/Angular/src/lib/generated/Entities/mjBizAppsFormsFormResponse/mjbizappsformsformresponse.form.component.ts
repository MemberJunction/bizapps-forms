import { Component } from '@angular/core';
import { mjBizAppsFormsFormResponseEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Responses') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformresponse-form',
    templateUrl: './mjbizappsformsformresponse.form.component.html'
})
export class mjBizAppsFormsFormResponseFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormResponseEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formStatus', sectionName: 'Form & Status', isExpanded: true },
            { sectionKey: 'respondentDetails', sectionName: 'Respondent Details', isExpanded: true },
            { sectionKey: 'submissionMetadata', sectionName: 'Submission Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormResponseAnswers', sectionName: 'Form Response Answers', isExpanded: false }
        ]);
    }
}

