# 🔌 MCP Servers Documentation

MCP (Model Context Protocol) lets Claude connect to external tools like JIRA, GitHub, Slack, and databases.

## How MCP Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │────▶│   MCP Server    │────▶│  External API   │
│                 │◀────│  (local bridge) │◀────│  (JIRA, GitHub) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

MCP servers run locally and provide Claude with tools to interact with external services.

## Configuration

**File:** `.mcp.json` (project root)

### Basic Structure

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@package/mcp-server"],
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | `stdio` (local) or `http` (remote) |
| `command` | stdio | Command to run (e.g., `npx`, `python`) |
| `args` | No | Command arguments |
| `env` | No | Environment variables |
| `url` | http | Remote server URL |
| `headers` | http | HTTP headers for auth |

## Common MCP Servers

### Issue Tracking

#### JIRA
```json
{
  "jira": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic/mcp-jira"],
    "env": {
      "JIRA_HOST": "${JIRA_HOST}",
      "JIRA_EMAIL": "${JIRA_EMAIL}",
      "JIRA_API_TOKEN": "${JIRA_API_TOKEN}"
    }
  }
}
```

**Tools provided:**
- `jira_get_issue` — Read ticket details
- `jira_update_issue` — Update status, add comments
- `jira_create_issue` — Create new tickets
- `jira_search` — Search issues with JQL

#### Linear
```json
{
  "linear": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic/mcp-linear"],
    "env": {
      "LINEAR_API_KEY": "${LINEAR_API_KEY}"
    }
  }
}
```

### Code & DevOps

#### GitHub
```json
{
  "github": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

**Tools provided:**
- `github_create_issue`
- `github_create_pull_request`
- `github_search_code`
- `github_get_file_contents`

#### Sentry
```json
{
  "sentry": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic/mcp-sentry"],
    "env": {
      "SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}",
      "SENTRY_ORG": "${SENTRY_ORG}"
    }
  }
}
```

### Communication

#### Slack
```json
{
  "slack": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic/mcp-slack"],
    "env": {
      "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
      "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"
    }
  }
}
```

### Databases

#### PostgreSQL
```json
{
  "postgres": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic/mcp-postgres"],
    "env": {
      "DATABASE_URL": "${DATABASE_URL}"
    }
  }
}
```

### Search & Research

#### Brave Search
```json
{
  "brave-search": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@anthropic/mcp-brave-search"],
    "env": {
      "BRAVE_API_KEY": "${BRAVE_API_KEY}"
    }
  }
}
```

### Browser Automation

#### Puppeteer
```json
{
  "puppeteer": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-puppeteer"]
  }
}
```

## Environment Variables

### Variable Expansion

MCP configs support variable expansion:
- `${VAR}` — Expands to env var (fails if not set)
- `${VAR:-default}` — Uses default if VAR not set

### Setting Variables

**Option 1: Shell profile (~/.zshrc or ~/.bashrc)**
```bash
export JIRA_HOST="https://company.atlassian.net"
export JIRA_EMAIL="you@company.com"
export JIRA_API_TOKEN="your-api-token"
```

**Option 2: .env file (don't commit!)**
```
JIRA_HOST=https://company.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=your-api-token
```

## Using MCP in Claude

Once configured, Claude automatically has access to MCP tools.

### Example: Work on a JIRA ticket

```
You: /ticket PROJ-123

Claude: Let me fetch that ticket...
[Uses jira_get_issue tool]

I found PROJ-123: "Add user avatar upload"

Acceptance criteria:
- Upload button on profile page
- Support JPG/PNG up to 5MB
- Show loading state

Let me implement this...
[Implements feature]

I'll update the ticket status...
[Uses jira_update_issue tool]

Done! Ticket moved to "In Review" and I've added a comment with the PR link.
```

### Example: Check Sentry errors

```
You: What errors are we seeing in production?

Claude: [Uses sentry_list_issues tool]

Here are the top 5 errors in the last 24 hours:
1. TypeError in UserProfile.tsx (152 occurrences)
2. Network error in api/users (89 occurrences)
...
```

## CLI Commands

```bash
# Add a server
claude mcp add github -- npx -y @modelcontextprotocol/server-github

# List servers
claude mcp list

# Remove a server
claude mcp remove github

# Test a server
claude mcp get github
```

## Troubleshooting

### Server Not Connecting

1. Check environment variables are set
2. Verify npx can find the package
3. Run with debug: `claude --mcp-debug`

### Tools Not Appearing

1. Restart Claude Code session
2. Check server is enabled in settings
3. Verify `.mcp.json` syntax is valid

### Authentication Errors

1. Verify API tokens are correct
2. Check token permissions
3. Ensure tokens haven't expired

## Security Best Practices

1. ⚠️ **Never commit `.mcp.json` with secrets** — use environment variables
2. 🔒 Use minimal permissions for API tokens
3. 🔄 Rotate tokens regularly
4. 📋 Audit which MCP servers have access to what
