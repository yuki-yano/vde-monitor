import type { z } from "zod";

import type {
  ApiError,
  ClaudeHookEvent,
  CommandResponse,
  GeneratedConfigTemplate,
  LaunchAgentResult,
  LaunchCommandResponse,
  LaunchConfig,
  NotificationSettings,
  PushSubscriptionJson,
  ScreenResponse,
  SessionDetail,
  SessionStateTimeline,
  SessionStateTimelineItem,
  SessionSummary,
  UsageBilling,
  UsageBillingMeta,
  UsageDashboardResponse,
  UsageGlobalTimelineResponse,
  UsageIssue,
  UsageMetricWindow,
  UsageProviderCapabilities,
  UsageProviderSnapshot,
  UserConfigReadable,
} from "./types";
import type {
  apiErrorSchema,
  claudeHookEventSchema,
  commandResponseSchema,
  generatedConfigTemplateSchema,
  launchAgentResultSchema,
  launchCommandResponseSchema,
  launchConfigSchema,
  notificationSettingsSchema,
  pushSubscriptionJsonSchema,
  screenResponseSchema,
  sessionDetailSchema,
  sessionStateTimelineItemSchema,
  sessionStateTimelineSchema,
  sessionSummarySchema,
  usageBillingMetaSchema,
  usageBillingSchema,
  usageDashboardResponseSchema,
  usageGlobalTimelineResponseSchema,
  usageIssueSchema,
  usageMetricWindowSchema,
  usageProviderCapabilitiesSchema,
  usageProviderSnapshotSchema,
  userConfigSchema,
} from "./schemas";

type AssertTrue<T extends true> = T;
type IsAssignable<Actual, Expected> = [Actual] extends [Expected] ? true : false;

type ContractChecks = [
  AssertTrue<IsAssignable<z.infer<typeof apiErrorSchema>, ApiError>>,
  AssertTrue<IsAssignable<ApiError, z.infer<typeof apiErrorSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof commandResponseSchema>, CommandResponse>>,
  AssertTrue<IsAssignable<CommandResponse, z.infer<typeof commandResponseSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof screenResponseSchema>, ScreenResponse>>,
  AssertTrue<IsAssignable<ScreenResponse, z.infer<typeof screenResponseSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof sessionSummarySchema>, SessionSummary>>,
  AssertTrue<IsAssignable<SessionSummary, z.infer<typeof sessionSummarySchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof sessionDetailSchema>, SessionDetail>>,
  AssertTrue<IsAssignable<SessionDetail, z.infer<typeof sessionDetailSchema>>>,
  AssertTrue<
    IsAssignable<z.infer<typeof sessionStateTimelineItemSchema>, SessionStateTimelineItem>
  >,
  AssertTrue<
    IsAssignable<SessionStateTimelineItem, z.infer<typeof sessionStateTimelineItemSchema>>
  >,
  AssertTrue<IsAssignable<z.infer<typeof sessionStateTimelineSchema>, SessionStateTimeline>>,
  AssertTrue<IsAssignable<SessionStateTimeline, z.infer<typeof sessionStateTimelineSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof usageMetricWindowSchema>, UsageMetricWindow>>,
  AssertTrue<IsAssignable<UsageMetricWindow, z.infer<typeof usageMetricWindowSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof usageBillingMetaSchema>, UsageBillingMeta>>,
  AssertTrue<IsAssignable<UsageBillingMeta, z.infer<typeof usageBillingMetaSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof usageBillingSchema>, UsageBilling>>,
  AssertTrue<IsAssignable<UsageBilling, z.infer<typeof usageBillingSchema>>>,
  AssertTrue<
    IsAssignable<z.infer<typeof usageProviderCapabilitiesSchema>, UsageProviderCapabilities>
  >,
  AssertTrue<
    IsAssignable<UsageProviderCapabilities, z.infer<typeof usageProviderCapabilitiesSchema>>
  >,
  AssertTrue<IsAssignable<z.infer<typeof usageIssueSchema>, UsageIssue>>,
  AssertTrue<IsAssignable<UsageIssue, z.infer<typeof usageIssueSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof usageProviderSnapshotSchema>, UsageProviderSnapshot>>,
  AssertTrue<IsAssignable<UsageProviderSnapshot, z.infer<typeof usageProviderSnapshotSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof usageDashboardResponseSchema>, UsageDashboardResponse>>,
  AssertTrue<IsAssignable<UsageDashboardResponse, z.infer<typeof usageDashboardResponseSchema>>>,
  AssertTrue<
    IsAssignable<z.infer<typeof usageGlobalTimelineResponseSchema>, UsageGlobalTimelineResponse>
  >,
  AssertTrue<
    IsAssignable<UsageGlobalTimelineResponse, z.infer<typeof usageGlobalTimelineResponseSchema>>
  >,
  AssertTrue<IsAssignable<z.infer<typeof launchConfigSchema>, LaunchConfig>>,
  AssertTrue<IsAssignable<LaunchConfig, z.infer<typeof launchConfigSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof launchAgentResultSchema>, LaunchAgentResult>>,
  AssertTrue<IsAssignable<LaunchAgentResult, z.infer<typeof launchAgentResultSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof launchCommandResponseSchema>, LaunchCommandResponse>>,
  AssertTrue<IsAssignable<LaunchCommandResponse, z.infer<typeof launchCommandResponseSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof pushSubscriptionJsonSchema>, PushSubscriptionJson>>,
  AssertTrue<IsAssignable<PushSubscriptionJson, z.infer<typeof pushSubscriptionJsonSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof notificationSettingsSchema>, NotificationSettings>>,
  AssertTrue<IsAssignable<NotificationSettings, z.infer<typeof notificationSettingsSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof claudeHookEventSchema>, ClaudeHookEvent>>,
  AssertTrue<IsAssignable<ClaudeHookEvent, z.infer<typeof claudeHookEventSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof generatedConfigTemplateSchema>, GeneratedConfigTemplate>>,
  AssertTrue<IsAssignable<GeneratedConfigTemplate, z.infer<typeof generatedConfigTemplateSchema>>>,
  AssertTrue<IsAssignable<z.infer<typeof userConfigSchema>, UserConfigReadable>>,
  AssertTrue<IsAssignable<UserConfigReadable, z.infer<typeof userConfigSchema>>>,
];

export type { ContractChecks };
