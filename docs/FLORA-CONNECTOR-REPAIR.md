# FLORA identifier conflict — resolved 2026-10-25

## Cause and proof
Live upstream schema has optional asset_id / asset_ids and required: []. Runtime accepts ONE field.
The chat-exposed schema made both fields mandatory, and repeated calls sent both. Increasing a
timeout cannot solve an invalid request. No evidence of a credential or account-permission problem.
The existing local authenticated client sent {"asset_ids":[...]} and received HTTP 200 with all three
uploaded assets ready. Do not replace ready assets or repeat completed generations.

## Canonical fix (outside the Hotel Builders git repo)
Directory: C:\Users\clementy\Documents\Cline\MCP\flora-mcp\
- asset-tools.mjs: pure discovery/argument adapters; aliases expose exactly one required field.
- bridge.mjs: advertises aliases when upstream supports the targets, translates calls and rejects
  conflicting raw inputs locally before network/auth. Upstream tools/auth/transport are preserved.
- call.mjs: exposes and invokes the same aliases from the existing command-line client.
- asset-tools.test.mjs: seven unit tests for exact JSON, limits, invalid/conflicting inputs and
  unmodified discovery pagination/unrelated responses.
- asset-tools.smoke.mjs: launches a fresh real stdio bridge, discovers aliases, checks local rejection,
  performs a real read-only asset lookup and terminates only its own child. No generation or uploads.

Never copy tokens.json, client.json or credentials into this repository. No credentials were added.
These installed source files are the authoritative fix; there is no bundled connector copy to patch.

## Use
After Cline's FLORA server reconnects, choose flora_complete_assets_batch or flora_get_assets_batch.
Their sole argument is asset_ids (limits 25 and 100 respectively). A single-item array is valid.
Until the existing connection refreshes, use the working local client:

```powershell
node 'C:\Users\clementy\Documents\Cline\MCP\flora-mcp\call.mjs' schema flora_complete_assets_batch
node 'C:\Users\clementy\Documents\Cline\MCP\flora-mcp\call.mjs' call flora_get_assets_batch 'C:\Users\clementy\.kimi-code\hotel-builders\review\repair-evidence\finalise-pilot-assets.json'
```

Do not rerun completion on this pilot just to test the wrapper; it is already ready. Lookup suffices.
Check HTTP status AND per-item status/error, not just CLI exit code. The existing CLI clips long
strings by default; set FLORA_TRUNC suitably in the process environment for full result capture.
No broad normalisation silently drops an argument. Ambiguous calls fail -32602 with an explanation.

## Validation
node --test 'C:\Users\clementy\Documents\Cline\MCP\flora-mcp\asset-tools.test.mjs' -> 7/7 PASS.
node 'C:\Users\clementy\Documents\Cline\MCP\flora-mcp\asset-tools.smoke.mjs' -> live smoke PASS.
bridge.mjs and call.mjs parse. No config, timeout, auto-approval or authentication changes made.
Existing Cline process not restarted by force; new processes use the fix immediately.
