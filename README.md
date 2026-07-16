# Conduit

Conduit is a tool gateway for AI agents.

Instead of connecting an agent to many tools one by one, the agent connects to a single tool: Conduit. Conduit then connects that agent to tools exposed through OpenAPI specifications or MCP servers.

## Why Conduit?

Conduit unifies different tool ecosystems behind one gateway:

- **One tool for agents**: agents use a consistent Conduit interface instead of learning a separate integration for every tool.
- **OpenAPI and MCP support**: connect existing APIs and MCP servers through the same gateway.
- **Works across agents**: use the same tool access pattern with different agent frameworks and runtimes.
- **Team sharing**: make shared tool connections available to a whole team instead of configuring them separately for every agent.

The result is a simpler way to give agents access to the tools they need while keeping tool connectivity centralized and reusable.

## Tooling

- Node.js 24, pinned in `.node-version`
- `nub` 0.4.11, pinned in `package.json`
- Turborepo root tasks for global quality commands
- Ultracite with Oxlint and Oxfmt
- VS Code and Zed settings for CSS, JavaScript, TypeScript, TSX, JSON, and JSONC

## Quality commands

```sh
nub install
nub run check
nub run fix
nub run lint
nub run format
nub run typecheck
nub run doctor
```

Run `nub run check` after every change. If it reports issues, run `nub run fix` and check again.

The `nub run` wrappers delegate to Turborepo. You can invoke a global quality task directly with `nubx turbo run quality:check`.
