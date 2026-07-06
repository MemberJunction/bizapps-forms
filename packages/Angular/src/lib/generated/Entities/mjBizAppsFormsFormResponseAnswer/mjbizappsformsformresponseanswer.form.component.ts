import { Component } from '@angular/core';
import { mjBizAppsFormsFormResponseAnswerEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Response Answers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformresponseanswer-form',
    templateUrl: './mjbizappsformsformresponseanswer.form.component.html'
})
export class mjBizAppsFormsFormResponseAnswerFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormResponseAnswerEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'formResponseContext', sectionName: 'Form Response Context', isExpanded: true },
            { sectionKey: 'answerContent', sectionName: 'Answer Content', isExpanded: true },
            { sectionKey: 'fileAttachment', sectionName: 'File Attachment', isExpanded: true },
            { sectionKey: 'evaluationAndScoring', sectionName: 'Evaluation and Scoring', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

