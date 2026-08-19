# SeaTable Agent Skills

Reusable Agent Skills for working with [SeaTable](https://seatable.com/) bases.

The skills in this repository follow the `SKILL.md` convention and are not tied
to a specific AI agent. They can be used by agents that support Agent Skills and
provide the required network and command-execution capabilities.

## Available skills

| Skill | Description |
| --- | --- |
| [`seatable`](skills/seatable/SKILL.md) | Manage SeaTable tables, columns, rows, queries, and file or image attachments through the SeaTable API. |

## Requirements

- Access to a SeaTable server
- A Base API Token with the permissions required for the requested operation
- An agent that supports the `SKILL.md` convention
- Network access to the SeaTable server
- `curl` and `python3`, or equivalent HTTP and JSON-processing tools

## Installation

### Skills CLI

Install the SeaTable skill from GitHub with the open Agent Skills CLI:

```bash
npx skills add seatable/skills@seatable
```

The CLI lets you select the supported agent or installation scope when needed.

### Manual installation

Clone this repository:

```bash
git clone https://github.com/seatable/skills.git seatable-skills
```

Copy the complete `skills/seatable` directory into the skills directory used by
your agent:

```bash
cp -R seatable-skills/skills/seatable /path/to/your-agent/skills/
```

Skill discovery directories differ between agents. Consult your agent's
documentation if it does not automatically discover the installed skill.

## Configuration

Provide the SeaTable server URL and Base API Token as environment variables:

```bash
export SEATABLE_SERVER="https://your-seatable.example.com"
export SEATABLE_API_TOKEN="your_base_api_token_here"
```

For desktop or hosted agents, configure these values in the agent runtime's
environment or secret settings. A shell `export` is available only to processes
started from that shell.

Generate a Base API Token from the target base in SeaTable and grant only the
permissions the agent needs. A token is scoped to one base.

Do not commit server credentials or API tokens to this repository, prompts,
logs, screenshots, or example files.

## Usage

Ask the agent to use the SeaTable skill and describe the intended operation:

```text
Use the seatable skill to list all tables in the configured base.
Use the seatable skill to create a Projects table with 10 test rows.
Use the seatable skill to update the Status column for a matching row.
Use the seatable skill to upload a file and attach it to a row.
```

Agents that support explicit skill invocation may also accept prompts such as:

```text
$seatable List all tables in the current base.
```

If either environment variable is unavailable, the agent should ask the user
to configure it in the agent environment or provide the missing value for the
current task. The agent must treat `SEATABLE_API_TOKEN` as sensitive and never
repeat, print, or persist it.

## Compatibility

The skill body is platform-neutral. Installation paths, skill invocation, and
available tools vary by agent. An agent must be able to make authenticated HTTP
requests and process JSON to execute the documented workflows.

This skill supports SeaTable 5.3 and later.

## Security

- Use a dedicated Base API Token with least-privilege permissions.
- Review destructive requests before deleting tables, columns, or rows.
- Keep tokens out of Git history and agent-visible project files.
- Revoke and replace a token immediately if it is exposed.

## License

Licensed under the [Apache License 2.0](LICENSE).
