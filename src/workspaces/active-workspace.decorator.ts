import { createParamDecorator, ExecutionContext, ForbiddenException, Injectable, PipeTransform } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Workspace } from '../entities/workspace.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceAccessService } from './workspace-access.service';

export const WORKSPACE_HEADER = 'x-workspace-id';

export interface ActiveWorkspaceContext {
  tenantId: string | null;
  headerRef: string | null;
  user?: User | null;
  apiKey?: ApiKey | null;
}

export function readWorkspaceHeader(req: { headers?: Record<string, unknown> } | undefined): string | null {
  const raw = req?.headers?.[WORKSPACE_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw) as string | undefined;
  return value?.trim() || null;
}

function requestOf(context: ExecutionContext): any {
  if (context.getType() === 'http') return context.switchToHttp().getRequest();
  return GqlExecutionContext.create(context).getContext().req;
}

/** Collects what the request says about the workspace. ActiveWorkspacePipe resolves it. */
export const ActiveWorkspaceContextParam = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ActiveWorkspaceContext => {
    const req = requestOf(context);
    const user: User | undefined = req?.user;
    const apiKey: ApiKey | undefined = req?.apiKey;
    return {
      tenantId: user?.tenantId || apiKey?.tenantId || null,
      headerRef: readWorkspaceHeader(req),
      user: user ?? null,
      apiKey: apiKey ?? null,
    };
  },
);

@Injectable()
export class ActiveWorkspacePipe implements PipeTransform<ActiveWorkspaceContext, Promise<Workspace>> {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly accessService: WorkspaceAccessService,
  ) {}

  async transform(value: ActiveWorkspaceContext): Promise<Workspace> {
    if (!value?.tenantId) throw new ForbiddenException('Tenant context required.');
    const { headerRef, user, apiKey } = value;
    const access = await this.accessService.accessFor(user, apiKey);
    return this.workspacesService.resolveActive(value.tenantId, { headerRef, user, apiKey, access });
  }
}

/** The active workspace of the request. The module must import WorkspacesModule. */
export const ActiveWorkspace = () => ActiveWorkspaceContextParam(ActiveWorkspacePipe);
