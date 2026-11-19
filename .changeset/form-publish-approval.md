---
"@mj-biz-apps/forms-entities": minor
"@mj-biz-apps/forms-core-entities-server": minor
"@mj-biz-apps/forms-actions": minor
"@mj-biz-apps/forms-server": minor
"@mj-biz-apps/forms-ng": minor
---

Publish approval, per form and off by default. A form with **Requires Publish Approval** on is not published directly: the author requests approval (`Forms.RequestPublishApproval`), which writes the new version **In Review** and starts a task-graph workflow. The workflow asks the form's **Publish Approver Role** through bizapps-tasks, then settles the version (`Forms: Settle Publish Review`). Approved, it goes live with the exact snapshot the approver reviewed. Rejected, or when the review expires, it is **Rejected** with the approver's notes, and the live version keeps serving.

Migration `V202611191337` adds `Form.RequiresPublishApproval` / `PublishApproverRoleID`, `FormVersion.ApprovalWorkflowTaskID` / `ReviewNotes`, and the `InReview` and `Rejected` statuses. Needs a MemberJunction release with task-graph Human-step providers (MemberJunction/MJ#6763) and bizapps-tasks with its `BizAppsTasks` provider.
