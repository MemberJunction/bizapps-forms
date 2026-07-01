import { Component } from '@angular/core';
import { mjBizAppsFormsFormDistributionEntity } from '@mj-biz-apps/forms-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ_BizApps_Forms: Form Distributions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjbizappsformsformdistribution-form',
    templateUrl: './mjbizappsformsformdistribution.form.component.html'
})
export class mjBizAppsFormsFormDistributionFormComponent extends BaseFormComponent {
    public record!: mjBizAppsFormsFormDistributionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'distributionConfiguration', sectionName: 'Distribution Configuration', isExpanded: true },
            { sectionKey: 'accessAndLimits', sectionName: 'Access and Limits', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

