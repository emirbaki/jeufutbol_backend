# JeuHub MCP Guide

## 1. What it is

JeuHub has an MCP server for AI agents. An agent can upload a video, make a post and publish it on your social accounts.

- Endpoint: `https://<api-host>/api/mcp`
- Transport: Streamable HTTP. The server is stateless and sends JSON responses.
- Server name: `jeuhub`, version `1.0.0`.
- The endpoint accepts only `POST`. A `GET` or a `DELETE` gets HTTP 405.

## 2. Make an API key

1. In JeuHub, open **Settings**, then the **Developer** tab, then the **API Keys** section.
2. Make a new key from your user account. A key with no user cannot use the post tools.
3. Give the key the scopes for the tools that you need.
4. Copy the key. JeuHub shows the full key one time only.

| Tool group | Scopes |
|---|---|
| Accounts | `credentials:read` for `list_connected_accounts`. `posts:read` for `get_tiktok_creator_info`. |
| Media | `posts:write` |
| Posts | `posts:read` to read. `posts:write` to make, change and publish. `posts:delete` to delete. |
| AI | `insights:generate` to generate. `insights:read` to read. |
| Jobs | Any valid key |

The tool list shows only the tools that your scopes allow.

## 3. Connect a client

For Claude Code, run this command:

```bash
claude mcp add --transport http jeuhub https://<api-host>/api/mcp --header "Authorization: Bearer <jeu-api-key>"
```

For other clients, use these values:

- URL: `https://<api-host>/api/mcp`
- Header: `Authorization: Bearer <jeu-api-key>`. The `jeu-api-key: <jeu-api-key>` header also works.

## 4. Tools

| Group | Tool | Scope | Input | Output |
|---|---|---|---|---|
| Accounts | `list_workspaces` | `credentials:read` | none | Each workspace: `workspace` (slug), `name`, `isDefault`, `accountCount` |
| Accounts | `list_connected_accounts` | `credentials:read` | `platform?`, `workspace?` | Each account: `credentialId`, `platform`, `accountName`, `workspace`, `tokenState` |
| Accounts | `get_tiktok_creator_info` | `posts:read` | `workspace?` | Privacy options, posting limits, interaction settings of the TikTok account in the workspace |
| Media | `create_upload` | `posts:write` | `filename`, `sizeBytes`, `mimeType` | `uploadId`, `uploadToken`, `chunkSize`, `totalChunks`, `expiresAt`, `commands` |
| Media | `complete_upload` | `posts:write` | `uploadId` | `mediaUrl`, `size` |
| Media | `import_media_from_url` | `posts:write` | `url` | `jobId` |
| Posts | `create_post` | `posts:write` | `content`, `targetPlatforms`, `mediaUrls?`, `scheduledFor?`, `youtubeSettings?`, `tiktokSettings?`, `instagramSettings?`, `platformSpecificContent?`, `workspace?` | `postId`, `status`, `workspace` |
| Posts | `update_post` | `posts:write` | `postId` and the fields of `create_post` | The post |
| Posts | `publish_post` | `posts:write` | `postId` | `postId`, `jobState: 'waiting'` |
| Posts | `retry_publish_post` | `posts:write` | `postId` | `postId`, `jobState: 'waiting'` |
| Posts | `get_post` | `posts:read` | `postId` | `status`, `failureReasons`, `publishedPosts` (platform and URL), `jobState`, `workspace` |
| Posts | `list_posts` | `posts:read` | `limit?`, `offset?`, `status?`, `workspace?` | A page of posts, each with its `workspace` |
| Posts | `delete_post` | `posts:delete` | `postId` | `deleted: true` |
| AI | `generate_post_text` | `insights:generate` | `insights[]`, `platform`, `tone?`, `llmProvider?`, `credentialId?` | `jobId` |
| AI | `generate_insights` | `insights:generate` | `topic?`, `llmProvider?`, `credentialId?` | `jobId` |
| AI | `get_insights` | `insights:read` | `limit?` | The saved insights for the tenant |
| AI | `analyze_trends` | `insights:read` | `topic?`, `timeRange?` | Trend data for your tenant (synchronous) |
| Jobs | `get_job` | any valid caller | `jobId` | `status`, `progress`, `result` when the job is complete |

Use the tools in this sequence: `list_workspaces`, then `list_connected_accounts`, then `create_upload` or `import_media_from_url`, then `create_post`, then `publish_post`, then `get_post`.

Call `get_tiktok_creator_info` before each TikTok post. The TikTok content rules need this step.

### Workspaces

A workspace is one branch of your organization, for example Football or Cinema. Each social account belongs to one workspace.

- `workspace` takes the slug from `list_workspaces` (for example `football`) or the workspace ID.
- When you do not give `workspace`, the tool uses the default workspace.
- `create_post` publishes with the accounts of its workspace. For each platform, it uses the newest active account in that workspace.
- One API key reaches all workspaces of your organization.

## 5. Upload a local file

1. Call `create_upload` with `filename`, `sizeBytes` and `mimeType`.
2. Run each command from `commands` in bash. On Windows, use Git Bash. Do not use PowerShell or cmd.
3. Call `complete_upload` with the `uploadId`. The result has the `mediaUrl`.
4. Put the `mediaUrl` in `mediaUrls` of `create_post`.

The commands for a file of more than 50 MB look like this:

```bash
split -b 52428800 -a 3 'video.mp4' jeu_1a2b3c4d_
curl -sS --fail-with-body -X POST 'https://<api-host>/api/mcp/uploads/<uploadId>/chunks/0' -H 'X-Upload-Token: <token>' -F 'chunk=@jeu_1a2b3c4d_aaa'
curl -sS --fail-with-body -X POST 'https://<api-host>/api/mcp/uploads/<uploadId>/chunks/1' -H 'X-Upload-Token: <token>' -F 'chunk=@jeu_1a2b3c4d_aab'
rm -f jeu_1a2b3c4d_*
```

- The part prefix is `jeu_` and the first 8 characters of the `uploadId`, then `_`.
- A file of 50 MB or less has one chunk. Then the commands have one `curl` command and no `split`.
- The commands use the upload token. They do not use your API key.
- The chunk route checks the upload token before it reads the body.

For a file that is on the web, call `import_media_from_url` with an `https` URL. Then call `get_job` with the `jobId` until the status is `completed`. The job result has the `mediaUrl`.

## 6. Example run

1. Call `list_workspaces`. Find the slug of the branch, for example `football`.
2. Call `list_connected_accounts` with `{ "workspace": "football" }`. Make sure that a `youtube` account is in the result.
3. Call `create_upload`:

   ```json
   { "filename": "match.mp4", "sizeBytes": 73400320, "mimeType": "video/mp4" }
   ```

4. Run the 4 commands from the result in bash.
5. Call `complete_upload` with the `uploadId`. Keep the `mediaUrl`.
6. Call `create_post`:

   ```json
   {
     "workspace": "football",
     "content": "Match highlights",
     "targetPlatforms": ["youtube"],
     "mediaUrls": ["<mediaUrl>"],
     "youtubeSettings": { "title": "Match highlights", "privacy_status": "private" }
   }
   ```

7. Call `publish_post` with the `postId`. The result has `jobState: 'waiting'`.
8. Call `get_post` with the `postId` until `status` is `published` or `failed`. When the status is `published`, `publishedPosts` has the YouTube URL.

## 7. Errors and limits

Each tool error has 3 parts: what failed, why, and the next step.

| Case | Result |
|---|---|
| Tool not in your scopes, or unknown tool | `Tool <name> is not available for this API key. Call tools/list to see the tools you can use.` |
| No account for a platform | `No youtube account is connected. Connect it in JeuHub Settings, then call list_connected_accounts.` |
| Input not valid | The field path and the rule. Example: `youtubeSettings.title is required when targetPlatforms has youtube.` |
| Upload token not valid or expired | HTTP 401 on the chunk route. Call `create_upload` again. |
| Chunk larger than 52428800 bytes | The chunk route rejects the chunk. Use the commands from `create_upload`. |
| Missing chunks | `complete_upload` gives the numbers of the missing chunks. Send them again, then call `complete_upload`. |
| Size not equal to `sizeBytes` | `complete_upload` rejects the upload. Call `create_upload` again with the correct size. |
| Publish fails on a platform | `get_post` shows `status: failed` and `failureReasons`. Call `retry_publish_post`. |
| Job from a different tenant | `Job not found.` |
| Unexpected error | `Internal error. Reference: <id>.` |

Limits:

- Maximum file size: 300 MB (314572800 bytes).
- Chunk size: 50 MB (52428800 bytes).
- Upload token lifetime: 1 hour (`MCP_UPLOAD_TOKEN_TTL`, default 3600 seconds).
- Rate limit: 1000 requests each minute for each IP address.
- Import from a URL: `https` only, 300 MB maximum (`MEDIA_IMPORT_MAX_BYTES`), 5 minutes maximum, 3 redirects maximum. The server rejects private, loopback and link-local addresses.
- Import file types: `.mp4 .mov .webm .m4v .mkv .avi .jpg .jpeg .png .webp .gif`.
- `publish_post` does not retry automatically. Use `retry_publish_post` for the failed platforms.
- `analyze_trends` shows the data of your tenant only.

Server environment variables: `PUBLIC_API_URL`, `MCP_UPLOAD_TOKEN_TTL` and `MEDIA_IMPORT_MAX_BYTES`. See `.env.example`.
