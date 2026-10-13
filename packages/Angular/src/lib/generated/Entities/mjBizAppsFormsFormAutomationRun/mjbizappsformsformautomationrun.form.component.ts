import { Component } from '@angular/core';
import { mjBizAppsFormsFormAutomationRunEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Automation Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformautomationrun-form',
    templateUrl: './mjbizappsformsformautomationrun.form.component.html'
})
export class mjBizAppsFormsFormAutomationRunFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormAutomationRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'automationContext', sectionName: 'Automation Context', isExpanded: true },
            { sectionKey: 'executionStatus', sectionName: 'Execution Status', isExpanded: true },
            { sectionKey: 'executionTimeline', sectionName: 'Execution Timeline', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

