import { Component } from '@angular/core';
import { mjBizAppsFormsFormPageEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Pages') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformpage-form',
    templateUrl: './mjbizappsformsformpage.form.component.html'
})
export class mjBizAppsFormsFormPageFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormPageEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'structureLogic', sectionName: 'Structure & Logic', isExpanded: true },
            { sectionKey: 'pageContent', sectionName: 'Page Content', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJBizAppsFormsFormQuestions', sectionName: 'Form Questions', isExpanded: false }
        ]);
    }
}

