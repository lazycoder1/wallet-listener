import type { Decimal } from '@prisma/client/runtime/library';

export interface CompanyParams {
    id: string;
}

export interface SlackConfigurationInput {
    channelId?: string | null;
    channelName?: string | null;
    alertThreshold?: number | string | Decimal;
    isEnabled?: boolean;
    slackTeamId?: string | null;
    slackTeamName?: string | null;
    // organizationDetails could be added if you plan to store Slack Workspace info
}

export interface CreateCompanyBody {
    name: string;
    slackConfiguration?: SlackConfigurationInput;
    dailyReportsEnabled?: boolean;
    dailyReportsEmail?: string | null;
}

export interface UpdateCompanyBody {
    name?: string; // Name becomes optional for updates if only Slack config is changing
    slackConfiguration?: SlackConfigurationInput;
    dailyReportsEnabled?: boolean;
    dailyReportsEmail?: string | null;
} 