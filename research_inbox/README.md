# Research inbox

Place independent Level 1 delta JSON files here. Files in this directory are inputs, not canonical data, and are never deleted by the apply workflow.

Preview is the default:

```powershell
python scripts/level1_delta.py research_inbox/level1_01_natural_outdoor.json
```

Apply requires a clean preview and an explicit batch token:

```powershell
python scripts/level1_delta.py research_inbox/level1_01_natural_outdoor.json --apply --confirm APPLY-L1-01
```
