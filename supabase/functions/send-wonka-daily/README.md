# send-wonka-daily

**These five .ts files are a MIRROR. Do not edit them here.**

Source of truth: `wonka/bootcamp/marketing/emails-bootcamp/edge/`. The words live in
`content.py` there and `emails.ts` is generated from it by `build_edge.py`, so an edit
made here is silently thrown away on the next sync.

```bash
# in the wonka repo
cd bootcamp/marketing/emails-bootcamp && ./check.sh   # rebuild + every gate
cd ../.. && ./scripts/sync_edge.sh check              # is this copy current?
./scripts/sync_edge.sh push                           # refresh it
# then commit here and:
gh workflow run deploy-edge-functions -f slugs="send-wonka-daily"
```

The copy exists only so the deploy workflow has something to deploy.
