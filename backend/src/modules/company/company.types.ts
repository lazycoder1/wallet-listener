import type { Decimal } from '@prisma/client/runtime/library';

export interface CompanyParams {
    id: string;
}

export interface SlackConfigurationInput {
    channelId?: string | null;
    channelName?: string | null;
    alertThreshold?: number | string | Decimal;
    isEnabled?: boolean;
    // organizationDetails could be added if you plan to store Slack Workspace info
}

export interface CreateCompanyBody {
    name: string;
    slackConfiguration?: SlackConfigurationInput;
}

export interface UpdateCompanyBody {
    name?: string; // Name becomes optional for updates if only Slack config is changing
    slackConfiguration?: SlackConfigurationInput;
} 