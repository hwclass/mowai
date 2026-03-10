# WIT Interface Evolution Rules

`agent.wit` is the canonical contract between host and agent. All templates copy it.

## Versioning

- **Additive changes** (new imports/exports with defaults): minor version bump (`0.2.0`)
- **Breaking changes** (changed signatures, removed exports): major version bump (`1.0.0`)
- All templates pin the WIT version in their `build.sh`

## Validation

```sh
wasm-tools component wit wit/agent.wit
```

Must exit 0 with no warnings before any merge.

## Propagation

After changing `wit/agent.wit`, copy it to all template directories:

```sh
cp wit/agent.wit templates/rust/wit/agent.wit
cp wit/agent.wit templates/go/wit/agent.wit
cp wit/agent.wit templates/js/wit/agent.wit
```

Update `spec.md` Section 3 and bump the package version in the WIT file.
