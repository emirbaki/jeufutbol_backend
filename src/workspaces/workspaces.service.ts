import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Workspace } from '../entities/workspace.entity';
import { Credential } from '../entities/credential.entity';
import { Post, PostStatus } from '../entities/post.entity';
import { MonitoredProfile } from '../entities/monitored-profile.entity';
import { Insight } from '../entities/insight.entity';
import { ChatSession } from '../insights/entities/chat-session.entity';
import { User } from '../entities/user.entity';
import { ApiKey } from '../entities/api-key.entity';
import { WorkspaceAccess, reaches } from './workspace-access.service';
import {
  DEFAULT_WORKSPACE_NAME,
  DEFAULT_WORKSPACE_SLUG,
  isUniqueViolation,
  isUuid,
  isValidSlug,
  slugify,
} from './workspace.utils';

const NAME_MAX = 60;

/** What the request says about the active workspace. */
export interface ActiveWorkspaceRequest {
  headerRef?: string | null;
  user?: User | null;
  apiKey?: ApiKey | null;
  /** The branches the caller can reach. Missing means all (background work). */
  access?: WorkspaceAccess;
}

export interface WorkspaceInput {
  name?: string;
  slug?: string;
}

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(Credential)
    private readonly credentialRepository: Repository<Credential>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(MonitoredProfile)
    private readonly profileRepository: Repository<MonitoredProfile>,
    @InjectRepository(Insight)
    private readonly insightRepository: Repository<Insight>,
    @InjectRepository(ChatSession)
    private readonly chatSessionRepository: Repository<ChatSession>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async list(tenantId: string, access: WorkspaceAccess = 'all'): Promise<Workspace[]> {
    await this.ensureDefault(tenantId);
    const all = await this.workspaceRepository.find({
      where: { tenantId },
      order: { isDefault: 'DESC', name: 'ASC' },
    });
    return all.filter((w) => reaches(access, w.id));
  }

  /**
   * Gives the default workspace of the tenant, and makes it when it is missing.
   * A new default also gets the accounts and posts that have no workspace
   * (rows made before workspaces existed, or columns added by synchronize).
   */
  async ensureDefault(tenantId: string): Promise<Workspace> {
    const existing = await this.findDefault(tenantId);
    if (existing) return existing;

    let created: Workspace;
    try {
      created = await this.workspaceRepository.save(
        this.workspaceRepository.create({
          tenantId,
          name: DEFAULT_WORKSPACE_NAME,
          slug: DEFAULT_WORKSPACE_SLUG,
          isDefault: true,
        }),
      );
    } catch (err) {
      // A parallel request made the default first.
      if (!isUniqueViolation(err)) throw err;
      const winner = await this.findDefault(tenantId);
      if (!winner) throw err;
      return winner;
    }

    const orphans = { tenantId, workspaceId: IsNull() };
    const target = { workspaceId: created.id };
    await this.credentialRepository.update(orphans, target);
    await this.postRepository.update(orphans, target);
    await this.profileRepository.update(orphans, target);
    await this.insightRepository.update(orphans, target);
    await this.chatSessionRepository.update(orphans, target);
    return created;
  }

  /** Finds a workspace of the tenant by ID or slug. No reference gives the default workspace. */
  async resolve(tenantId: string, ref?: string | null, access: WorkspaceAccess = 'all'): Promise<Workspace> {
    const value = ref?.trim();
    if (!value) return this.firstReachable(tenantId, access);

    const where = isUuid(value) ? { id: value, tenantId } : { slug: value.toLowerCase(), tenantId };
    const workspace = await this.workspaceRepository.findOne({ where });
    // A branch without access is "not found", so that it stays hidden.
    if (workspace && reaches(access, workspace.id)) return workspace;

    const known = (await this.workspaceRepository.find({ where: { tenantId }, order: { name: 'ASC' } })).filter((w) =>
      reaches(access, w.id),
    );
    throw new NotFoundException(
      `Workspace "${value}" not found. Use one of: ${known.map((w) => w.slug).join(', ')}.`,
    );
  }

  /**
   * The workspace that a request works in. Order: the X-Workspace-Id header,
   * the API key default, the user's stored workspace, the tenant default.
   * A header that does not resolve is an error. A stored ID that no longer
   * resolves falls through to the next step.
   */
  async resolveActive(tenantId: string, req: ActiveWorkspaceRequest): Promise<Workspace> {
    const access = req.access ?? 'all';
    if (req.headerRef?.trim()) return this.resolve(tenantId, req.headerRef, access);

    const stored = [req.apiKey?.defaultWorkspaceId, req.user?.activeWorkspaceId];
    for (const id of stored) {
      if (!id || !reaches(access, id)) continue;
      const workspace = await this.workspaceRepository.findOne({ where: { id, tenantId } });
      if (workspace) return workspace;
    }
    return this.firstReachable(tenantId, access);
  }

  /**
   * The branch for a caller who names none. With access to all: the tenant
   * default. With a list: the first branch of the list (the oldest membership).
   */
  private async firstReachable(tenantId: string, access: WorkspaceAccess): Promise<Workspace> {
    if (access === 'all') return this.ensureDefault(tenantId);
    const workspaces = await this.workspaceRepository.find({ where: { tenantId } });
    for (const id of access) {
      const workspace = workspaces.find((w) => w.id === id);
      if (workspace) return workspace;
    }
    throw new ForbiddenException('You are not a member of any branch. Ask an admin.');
  }

  /** Saves the workspace that opens for this user after login. */
  async setActive(user: User, workspaceRef: string, access: WorkspaceAccess = 'all'): Promise<User> {
    const workspace = await this.resolve(user.tenantId, workspaceRef, access);
    await this.userRepository.update({ id: user.id }, { activeWorkspaceId: workspace.id });
    user.activeWorkspaceId = workspace.id;
    user.activeWorkspace = workspace;
    return user;
  }

  async create(tenantId: string, input: WorkspaceInput & { name: string }): Promise<Workspace> {
    const name = this.checkName(input.name);
    const slug = this.checkSlug(input.slug?.trim() ?? slugify(name));
    return this.saveUnique(this.workspaceRepository.create({ tenantId, name, slug, isDefault: false }));
  }

  async update(tenantId: string, id: string, input: WorkspaceInput): Promise<Workspace> {
    const workspace = await this.findOwn(tenantId, id);
    if (input.name !== undefined) workspace.name = this.checkName(input.name);
    if (input.slug !== undefined) workspace.slug = this.checkSlug(input.slug.trim());
    return this.saveUnique(workspace);
  }

  async remove(tenantId: string, id: string): Promise<boolean> {
    const workspace = await this.findOwn(tenantId, id);
    if (workspace.isDefault) {
      throw new BadRequestException('You cannot delete the default workspace.');
    }

    const accounts = await this.credentialRepository.count({ where: { workspaceId: id, isActive: true } });
    if (accounts > 0) {
      throw new BadRequestException(`Move the ${accounts} accounts to another workspace first.`);
    }
    // A scheduled job would publish later and find no workspace.
    const openPosts = await this.postRepository.count({
      where: { workspaceId: id, status: In([PostStatus.DRAFT, PostStatus.SCHEDULED]) },
    });
    if (openPosts > 0) {
      throw new BadRequestException(`Move or delete the ${openPosts} draft and scheduled posts first.`);
    }

    const profiles = await this.profileRepository.count({ where: { workspaceId: id, isActive: true } });
    if (profiles > 0) {
      throw new BadRequestException(`Move or delete the ${profiles} monitored profiles first.`);
    }

    const fallback = await this.ensureDefault(tenantId);
    const moveTo = { workspaceId: fallback.id };
    await this.workspaceRepository.manager.transaction(async (em) => {
      await em.update(Credential, { workspaceId: id, isActive: false }, moveTo);
      await em.update(Post, { workspaceId: id }, moveTo);
      await em.update(MonitoredProfile, { workspaceId: id, isActive: false }, moveTo);
      await em.update(Insight, { workspaceId: id }, moveTo);
      await em.update(ChatSession, { workspaceId: id }, moveTo);
      // A person whose only branch this is moves to the default branch with the same role.
      await em.query(
        `INSERT INTO "workspace_members" ("workspaceId", "userId", "role")
         SELECT $1, m."userId", m."role" FROM "workspace_members" m
         WHERE m."workspaceId" = $2
           AND NOT EXISTS (SELECT 1 FROM "workspace_members" o WHERE o."userId" = m."userId" AND o."workspaceId" <> $2)
         ON CONFLICT DO NOTHING`,
        [fallback.id, id],
      );
      await em.delete(Workspace, { id, tenantId });
    });
    return true;
  }

  private findDefault(tenantId: string): Promise<Workspace | null> {
    return this.workspaceRepository.findOne({ where: { tenantId, isDefault: true } });
  }

  private async findOwn(tenantId: string, id: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({ where: { id, tenantId } });
    if (!workspace) throw new NotFoundException(`Workspace "${id}" not found.`);
    return workspace;
  }

  private checkName(raw: string): string {
    const name = (raw ?? '').trim();
    if (name.length < 1 || name.length > NAME_MAX) {
      throw new BadRequestException('The workspace name must have 1 to 60 characters.');
    }
    return name;
  }

  private checkSlug(slug: string): string {
    if (!isValidSlug(slug)) {
      throw new BadRequestException('The slug must have 2 to 40 characters: a-z, 0-9 and "-".');
    }
    return slug;
  }

  private async saveUnique(workspace: Workspace): Promise<Workspace> {
    try {
      return await this.workspaceRepository.save(workspace);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`The slug "${workspace.slug}" is already used. Choose another slug.`);
      }
      throw err;
    }
  }
}
