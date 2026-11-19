import { Migration } from './migration-runner';
import { migration001CoreSchema } from './001_core_schema';
import { migration002AuthSchema } from './002_auth_schema';
import { migration003AuditSyncSchema } from './003_audit_sync_schema';
import { migration004FinancialProtection } from './004_financial_protection';
import { migration005AcademicAndFinancialExtensions } from './005_academic_and_financial_extensions';
import { migration006ComprehensiveBusinessWorkflows } from './006_comprehensive_business_workflows';
import { migration007SyncEngineAndConflicts } from './007_sync_engine_and_conflicts';
import { migration008LicensingAndAutomatedBackups } from './008_licensing_and_automated_backups';
import { migration009PerformanceAndUpdates } from './009_performance_optimization_and_update_state';
import { migration010SubscriptionCheckpointsAndSecurity } from './010_subscription_checkpoints_and_security';
import { migration011RebuildSyncOutboxAndSeq } from './011_rebuild_sync_outbox_and_seq';

export const ALL_MIGRATIONS: Migration[] = [
  migration001CoreSchema,
  migration002AuthSchema,
  migration003AuditSyncSchema,
  migration004FinancialProtection,
  migration005AcademicAndFinancialExtensions,
  migration006ComprehensiveBusinessWorkflows,
  migration007SyncEngineAndConflicts,
  migration008LicensingAndAutomatedBackups,
  migration009PerformanceAndUpdates,
  migration010SubscriptionCheckpointsAndSecurity,
  migration011RebuildSyncOutboxAndSeq,
];

export * from './migration-runner';
