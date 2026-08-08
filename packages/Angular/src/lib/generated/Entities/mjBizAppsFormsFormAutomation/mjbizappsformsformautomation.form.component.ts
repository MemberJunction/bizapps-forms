import { Component } from '@angular/core';
import { mjBizAppsFormsFormAutomationEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Automations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformautomation-form',
    templateUrl: './mjbizappsformsformautomation.form.component.html'
})
export class mjBizAppsFormsFormAutomationFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormAutomationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'automationContext', sectionName: 'Automation Context', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'automationLogic', sectionName: 'Automation Logic', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormAutomationRuns', sectionName: 'Form Automation Runs', isExpanded: false }
        ]);
    }
}

