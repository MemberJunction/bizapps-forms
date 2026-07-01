import { Component } from '@angular/core';
import { mjBizAppsFormsFormQuestionEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Questions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformquestion-form',
    templateUrl: './mjbizappsformsformquestion.form.component.html'
})
export class mjBizAppsFormsFormQuestionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormQuestionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formStructure', sectionName: 'Form Structure', isExpanded: true },
            { sectionKey: 'questionContent', sectionName: 'Question Content', isExpanded: true },
            { sectionKey: 'rulesAndConfiguration', sectionName: 'Rules and Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormQuestionOptions', sectionName: 'Form Question Options', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormResponseAnswers', sectionName: 'Form Response Answers', isExpanded: false }
        ]);
    }
}

