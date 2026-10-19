import { Component } from '@angular/core';
import { mjBizAppsFormsFormAutomationEventEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Automation Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformautomationevent-form',
    templateUrl: './mjbizappsformsformautomationevent.form.component.html'
})
export class mjBizAppsFormsFormAutomationEventFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormAutomationEventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'automationContext', sectionName: 'Automation Context', isExpanded: true },
            { sectionKey: 'executionStatus', sectionName: 'Execution Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormAutomationRuns', sectionName: 'Form Automation Runs', isExpanded: false }
        ]);
    }
}

