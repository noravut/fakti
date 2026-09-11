# fakti

A local dev tool that hands defects and features to Claude Code or Codex and keeps you in control of the terminal.

You pick defects in a web UI, fakti creates a git branch, spawns the selected CLI in a pty, and streams
it to your browser over WebSocket. You can type into that terminal exactly like a normal one —
answer questions, interrupt with Ctrl+C, scroll history. Nothing is one-shot.

Everything runs on your own machine. The server binds to `127.0.0.1` only.

---

## Requirements

| | |
|---|---|
| Node | 20 or newer (developed on 22) |
| pnpm | 10 (uses `onlyBuiltDependencies` in `pnpm-workspace.yaml`) |
| `claude` or `codex` | the CLI you select must be on your server's `PATH` and already logged in |
| Build toolchain | needed to compile `node-pty` (a native module) |

Install the toolchain first, or `pnpm install` will fail:

```bash
# macOS
xcode-select --install

# Debian / Ubuntu / WSL
sudo apt install -y build-essential python3
```

`node-pty` needs to run its build script. pnpm 10 blocks build scripts by default, so
`pnpm-workspace.yaml` already allowlists it via `onlyBuiltDependencies`. Don't remove that entry.

---

## Install and run

```bash
git clone https://github.com/noravutC/fakti.git
cd fakti
pnpm install
pnpm build
pnpm start
```

Then open **http://127.0.0.1:5273** — fakti also tries to open your browser automatically.

Set `PAT_NO_OPEN=1` to stop it from doing that (useful on WSL, where `xdg-open` usually
does nothing):

```bash
PAT_NO_OPEN=1 pnpm start
```

### Dev mode

```bash
pnpm dev
```

Vite serves the UI on **http://127.0.0.1:5173** and proxies `/api` and `/ws` to the backend on
5273. Use this one if you're changing the frontend — it hot-reloads.

### Other scripts

```bash
pnpm build       # build web then server
pnpm typecheck   # tsc --noEmit on both packages
```

---

## First run

1. Open the app. With no repos registered you land on **Setup**.
2. Paste the **absolute path** of a git repo on your machine, e.g. `/home/you/work/timecraft`.
   fakti validates it live and shows the remote and branch list.
3. Pick a base branch and a colour, then **เพิ่ม repo**.
4. You're now on the defect list. Tick one or more defects and press **แก้ที่เลือก**.
5. Choose **Claude Code** or **Codex**, confirm the branch name, then **เริ่มแก้**.

At step 5 fakti will, on your real repo:

- create a branch off `origin/<baseBranch>` (falling back to the local branch if there's no remote)
- write `.pat-task.md` containing the defect details, and add it to `.git/info/exclude`
- spawn the selected CLI in that directory with the instruction: `อ่าน .pat-task.md แล้วทำตามนั้น`

The same agent selector is available when starting a feature. Claude Code is the default;
older saved sessions also use Claude Code. Each session remembers its agent, including when
reopened. Appending defects or sending QA instructions uses that session's existing terminal.
Reopening starts a new conversation on the same branch; it does not resume the CLI transcript.

For Codex, install and sign in to the CLI before starting a session (`codex login`). fakti runs
`codex --no-alt-screen` with the initial file instruction as a positional argument. This keeps
scrollback available and avoids typing the initial task into startup dialogs. Your CLI's model,
sandbox and approval settings remain in effect; respond to prompts in the browser terminal.
See the [official Codex CLI reference](https://developers.openai.com/codex/cli/reference).

If your working tree is dirty, the dialog asks first: **stash** (`git stash push -u`) or
**continue on the current branch** (no new branch is created).

> Out of the box the defect list is **mock data** from `server/src/mock/defects.json`, served
> back to fakti as an ordinary source so it needs no network. Two entries come from the original
> design doc; the rest are made up. That file is bundled at build time, so edit it then re-run
> `pnpm -C server build`. To use a real tracker instead, see **Connecting a tracker** below.

---

## Navigation

Every page has a real URL. Refresh keeps you where you were, and the browser back button works
everywhere.

```
/                       defect list (home, no breadcrumb)
/session/:id            Defect / <branch>
/session/:id/summary    Defect / <branch> / สรุป
/sessions               session history
/settings               workspaces, active repo
/setup                  add a repo
```

- Every sub-page has a back link in the top-left naming its real destination.
- **Esc** goes back — except on the session page, where the terminal needs it.
- The session page says **"ย่อเก็บ"** (minimise), not "close". Leaving the page does **not** kill
  the session; the pty keeps running. Actually closing it lives in the `⋯` menu behind a confirm.
- The header shows a pill (`⟳ 2 session`) whenever sessions are alive. It turns amber and pulses
  if one is waiting on you.
- Unknown URLs and deleted session ids redirect home with a message instead of a blank screen.

---

## Project layout

```
shared/types.ts        API contract shared by both sides via the @shared/* path alias
server/src/core/       config (~/.pat + zod), git, session (pty lifecycle), prompt
server/src/routes/     workspaces · defects · sessions
server/src/ws.ts       WebSocket terminal bridge
web/src/               React 18 + Vite + Tailwind + xterm.js, wouter routing
```

Stack: Hono, node-pty, ws, zod on the server. React, Vite, Tailwind, wouter, zustand,
@xterm/xterm on the web. No database, no auth, no Docker, no Next.js — all deliberate.

---

## Configuration

Config lives in `~/.pat/` and is meant to be edited by hand:

| File | Contents | Safe to share |
|---|---|---|
| `workspaces.json` | registered repos, and each repo's source variables | no — machine-specific paths |
| `sessions.json` | session history (latest 50) | no |
| `settings.json` | active workspace, port | no |
| `sources.json` | how to reach your defect tracker | yes — holds no secrets |
| `secrets.json` | the tokens `sources.json` refers to, created `600` | **never** |

Every file is validated with zod on read. If one fails to parse, fakti backs it up to `.bak`,
starts from empty, and shows a warning in the web UI. It never crashes on bad config.
Writes are atomic (write to `.tmp`, then rename).

### Connecting a tracker

A tracker is described, not coded. A **source** is one JSON object saying where the API lives,
which request lists defects, and which field of the response maps to which field fakti shows.
No plugin, no subclass.

On first run fakti writes `~/.pat/sources.json` from `server/src/sources.default.json`, which
ships two sources: `mock` (the offline sample, active by default) and `netka`, a worked example
against a real tracker. Copy either one and edit it:

```jsonc
{
  "id": "jira",                                  // unique
  "label": "Team Jira",                          // shown in Settings
  "network": "internal",                         // internal = behind VPN, so unreachable is normal, not an error
  "baseUrl": "https://{host}/rest/api/2",        // {vars} work here too
  "auth": { "type": "bearer", "tokenRef": "jiraToken" },

  "vars": [                                      // filled in per repo, under Settings
    { "key": "host", "label": "Jira host", "required": true },
    { "key": "projectKey", "label": "Project key", "required": true }
  ],

  "list": {
    "method": "GET",
    "path": "/search",
    "query": { "jql": "project={projectKey} AND resolution=Unresolved" }
  },
  "detail": { "method": "GET", "path": "/issue/{id}" },

  "itemsPath": "issues",                         // path to the array; "" if the body is already one

  "map": {                                       // left: what fakti calls it. right: path in the API's JSON
    "id": "id",
    "key": "key",
    "title": "fields.summary",
    "severity": "fields.priority.name",
    "status": "fields.status.name",
    "reporter": "fields.reporter.displayName",
    "createdAt": "fields.created"
  },

  "openStatuses": ["To Do", "In Progress"],      // anything else counts as closed
  "severityOrder": ["Blocker", "Major", "Minor"] // heaviest first, then mapped onto critical/high/medium/low
}
```

Only `id`, `label`, `baseUrl`, `list` and `map.id` are required.

**Tokens never go in `sources.json`.** `auth` stores the *name* of a secret, and the value lives
in `~/.pat/secrets.json` — which is why `sources.json` is the one config file you can commit.

```jsonc
// ~/.pat/sources.json — shareable
"auth": { "type": "bearer", "tokenRef": "jiraToken" }

// ~/.pat/secrets.json — mode 600, never shared
{ "jiraToken": "the-real-value" }
```

Supported `auth.type`: `none`, `bearer` (`tokenRef`), `header` (`name` + `valueRef`),
`basic` (`userRef` + `passRef`), `query` (`name` + `valueRef`).

`sources.json` is re-read on every request, so edits take effect on the next page refresh — no
restart. Settings has a **test** button that walks the request one stage at a time and says which
stage broke: unreachable, TLS, auth, bad `itemsPath`, or a `map` field that matched nothing. When
a field misses it prints the keys the response actually had, which is the fastest way to get
`map` right.

**Sharing a source with your team:** add it to `server/src/sources.default.json` and commit —
it carries no secrets. Two caveats: that file is only consulted when `~/.pat/sources.json` does
not yet exist, so people who already ran fakti must add the entry to their own copy; and it is
bundled at build time, so re-run `pnpm -C server build` after editing.

---

## WSL notes

fakti runs inside WSL, so use **Linux paths** (`/home/you/work/repo`) — not `C:\...` or
`\\wsl$\...`. It will tell you so if you paste a Windows path.

- Your browser can be on Windows; WSL2 forwards `127.0.0.1` for you.
- **Start fakti from VS Code's integrated terminal** if you want the "เปิดใน VSCode" button to
  work. It shells out to `code`, which needs `VSCODE_IPC_HOOK_CLI` inherited from the
  environment to attach to your existing window.
- Keep repos on the Linux filesystem. Repos under `/mnt/c/...` work but git is slow there, and
  fakti polls `git status` every 5 seconds.

---

## Decisions that differ from the original spec

**The prompt is delivered through a file, not typed into the pty.**
Claude Code's TUI treats newlines as Enter, so a multi-line prompt gets split into several
messages and the agent starts working on the first line without context. fakti writes
`.pat-task.md` and sends one short line instead. The spec allows this fallback.

**`Session` has an extra `createdBranch` field.**
The spec's discard flow is `checkout - && branch -D <name>`. That is wrong when the user chose
"continue on the current branch", because fakti never created that branch — deleting it would
destroy their work. `createdBranch` records who made the branch, and discard only deletes it
when fakti did. Returning to the base branch uses `workspace.baseBranch` rather than
`checkout -`, since the reflog can move underneath you.

**Endpoints added beyond the spec's table.**
`PATCH /api/settings` (switch active workspace), `POST /api/sessions/:id/append`
(the "continue in an open session" option in the confirm dialog),
`POST /api/sessions/:id/reopen` (reopen on the same branch), and `warnings` in the
`/api/bootstrap` response so config problems can be surfaced in the UI.

**A diff is also broadcast on every state change,** not only every 5 seconds while working.
A burst of work shorter than 5 seconds would otherwise never update the UI, and the moment work
stops is exactly when the diff is final.

**The header pill counts every session that isn't closed,** not only `working`/`waiting`.
Sessions go `idle` after 2 seconds of silence while still being fully alive, so the literal rule
made the pill vanish moments after you minimised a session — which is the problem it exists to
prevent.

**Monospace font stacks include a Thai face.** JetBrains Mono has no Thai glyphs, so Thai text
rendered as empty boxes in both the UI and the terminal until `IBM Plex Sans Thai` was appended
to the fallback chain.

**An ErrorBoundary wraps all routes** to guarantee no blank screen — for example, an invalid
`severity` value in `defects.json` used to take the whole page down silently.

---

## Testing status

Verified end to end in a real browser (Chromium via Playwright) against a real git repo:

- workspace validation, registration, live `git status` polling
- session creation making a real branch, `.pat-task.md` written and git-excluded
- pty round trip: output streaming, typing from the browser, `pty.resize` taking effect,
  raw escape sequences (Ctrl+C, arrows, Esc) passing through
- reconnect buffer restoring scrollback after a refresh and after in-app navigation
- diff and commit parsing, summary page totals matching `git`
- discard deleting only fakti-created branches and leaving the user's own branch intact
- dirty-tree 409, branch-name validation, corrupt-config recovery
- graceful shutdown killing the pty with no orphan processes
- 36 navigation assertions: breadcrumbs, back links, Esc behaviour, browser back from every
  page, unknown URLs, sessions surviving page changes

**Full task execution is not verified against real Claude Code or Codex.** The pty tests used an interactive shim standing in for
`claude`. Spawning, I/O, resize and reconnect are proven; two TUI assumptions are not:
whether the single-line file prompt behaves as intended, and the `waiting` heuristic that looks
for `❯`, `(y/n)` or `Do you want`. That heuristic only changes a status colour and the tab
title — it never blocks anything.

---

## Security

- Binds to `127.0.0.1` only. This server spawns processes; never expose it.
- Every git call goes through `execFile` with an argument array. No shell strings, ever.
- Branch names are checked against `^[a-zA-Z0-9._/-]+$` before reaching git.
- The git wrapper has no `push`, `commit`, `merge`, `rebase` or `reset --hard`. If the code
  can't call them, it can't call them by accident.
- No auth, by design — single user on loopback.

---

## Not implemented yet

Real tracker API integration · guessing the repo from defect keywords · commit, push or opening
a PR from the web UI · commenting back on tickets · multi-user and auth.
