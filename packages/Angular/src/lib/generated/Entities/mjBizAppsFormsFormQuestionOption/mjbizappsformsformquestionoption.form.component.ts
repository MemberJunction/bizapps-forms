import { Component } from '@angular/core';
import { mjBizAppsFormsFormQuestionOptionEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Question Options') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformquestionoption-form',
    templateUrl: './mjbizappsformsformquestionoption.form.component.html'
})
export class mjBizAppsFormsFormQuestionOptionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormQuestionOptionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'optionConfiguration', sectionName: 'Option Configuration', isExpanded: true },
            { sectionKey: 'displaySettings', sectionName: 'Display Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

